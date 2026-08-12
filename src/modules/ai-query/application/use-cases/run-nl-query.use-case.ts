import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  NlQueryResult,
  QueryCellValue,
  QueryRow,
} from '../../domain/nl-query-result';
import {
  ISqlGeneratorPort,
  SQL_GENERATOR_PORT,
} from '../../domain/sql-generator.port';
import {
  IReadOnlyQueryPort,
  READ_ONLY_QUERY_PORT,
} from '../../domain/read-only-query.port';
import { UnsafeSqlError, assertReadOnlySql } from '../../domain/sql-guard';

const MAX_ROWS = 200;
const QUERY_TIMEOUT_MS = 20_000;
const MAX_CELL_LENGTH = 500;
const REDACTED_COLUMN = /pass(word)?|token|secret/i;

@Injectable()
export class RunNlQueryUseCase {
  private readonly logger = new Logger(RunNlQueryUseCase.name);

  constructor(
    @Inject(SQL_GENERATOR_PORT)
    private readonly sqlGenerator: ISqlGeneratorPort,
    @Inject(READ_ONLY_QUERY_PORT)
    private readonly readOnlyQuery: IReadOnlyQueryPort,
  ) {}

  async execute(question: string): Promise<NlQueryResult> {
    const trimmedQuestion = question.trim();

    const generated = await this.sqlGenerator.generate(
      trimmedQuestion,
      MAX_ROWS,
    );

    if (!generated.sql) {
      throw new BadRequestException(
        generated.rejectionReason ??
          'No se pudo interpretar la consulta. Intenta describirla de otra forma.',
      );
    }

    let safeSql: string;
    try {
      safeSql = assertReadOnlySql(generated.sql, MAX_ROWS);
    } catch (error) {
      if (error instanceof UnsafeSqlError) {
        this.logger.warn(
          `SQL rechazado por el validador: ${error.message} | SQL: ${generated.sql}`,
        );
        throw new BadRequestException(
          `La consulta generada fue rechazada por seguridad: ${error.message}`,
        );
      }
      throw error;
    }

    const startedAt = Date.now();
    const rawRows = await this.runOrFail(safeSql);
    const executionMs = Date.now() - startedAt;

    const rows = rawRows.map((row) => this.normalizeRow(row));

    return new NlQueryResult(
      trimmedQuestion,
      safeSql,
      generated.explanation,
      this.extractColumns(rows),
      rows,
      rows.length,
      rows.length >= MAX_ROWS,
      executionMs,
    );
  }

  private async runOrFail(sql: string): Promise<Record<string, unknown>[]> {
    try {
      return await this.readOnlyQuery.run(sql, QUERY_TIMEOUT_MS);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(
        `Fallo al ejecutar la consulta generada: ${message} | SQL: ${sql}`,
      );
      throw new BadRequestException(
        'La base de datos no pudo ejecutar la consulta generada. Reformula la pregunta con otras palabras.',
      );
    }
  }

  private extractColumns(rows: QueryRow[]): string[] {
    const columns: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    return columns;
  }

  private normalizeRow(row: Record<string, unknown>): QueryRow {
    const normalized: QueryRow = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = REDACTED_COLUMN.test(key)
        ? '••••••'
        : this.normalizeValue(value);
    }
    return normalized;
  }

  /** Los drivers devuelven BigInt, Date, Buffer y Decimal: nada de eso sobrevive a JSON.stringify. */
  private normalizeValue(value: unknown): QueryCellValue {
    if (value === null || value === undefined) return null;

    if (typeof value === 'bigint') {
      return Number.isSafeInteger(Number(value))
        ? Number(value)
        : value.toString();
    }

    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (typeof value === 'string') return this.truncate(value);

    if (value instanceof Date) return value.toISOString();

    if (Buffer.isBuffer(value) || value instanceof Uint8Array)
      return '[binario]';

    if (typeof value === 'object') {
      // Los Decimal de Prisma exponen toNumber(); el resto de objetos (JSON de BD) se serializan.
      const decimal = value as { toNumber?: () => number };
      if (typeof decimal.toNumber === 'function') return decimal.toNumber();
      return this.truncate(JSON.stringify(value));
    }

    // Aquí solo quedan symbol y function: nada que pueda venir de una fila de la base de datos.
    return null;
  }

  private truncate(value: string): string {
    return value.length > MAX_CELL_LENGTH
      ? `${value.slice(0, MAX_CELL_LENGTH)}…`
      : value;
  }
}
