import { ALLOWED_TABLES } from './database-catalog';

/**
 * Validador de SQL de solo lectura.
 *
 * El modelo de lenguaje NO es una frontera de seguridad: puede alucinar, o ser manipulado por lo
 * que el usuario escriba en la caja de texto. Esta función es la frontera real — cualquier SQL que
 * no sea un SELECT/WITH de una sola sentencia sobre las tablas del catálogo se rechaza antes de
 * llegar a la base de datos.
 */

export class UnsafeSqlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnsafeSqlError';
  }
}

/** Palabras que jamás pueden aparecer: escrituras, DDL, control de transacción y E/S de archivos. */
const FORBIDDEN_KEYWORDS = [
  'insert',
  'update',
  'delete',
  'drop',
  'alter',
  'create',
  'truncate',
  'rename',
  'grant',
  'revoke',
  'commit',
  'rollback',
  'savepoint',
  'lock',
  'unlock',
  'call',
  'execute',
  'prepare',
  'deallocate',
  'handler',
  'into',
  'outfile',
  'dumpfile',
  'infile',
  'load',
  'flush',
  'kill',
  'shutdown',
  'purge',
  'reset',
  'optimize',
  'analyze',
  'repair',
  'show',
  'describe',
  'explain',
  'values',
  'password',
  'information_schema',
  'performance_schema',
  'mysql',
] as const;

/** Funciones peligrosas (bloqueo/espera/lectura de archivos/introspección). */
const FORBIDDEN_FUNCTIONS = [
  'sleep',
  'benchmark',
  'load_file',
  'get_lock',
  'release_lock',
  'is_free_lock',
  'is_used_lock',
  'master_pos_wait',
  'user',
  'current_user',
  'session_user',
  'system_user',
  'database',
  'schema',
  'version',
] as const;

const TABLE_REFERENCE =
  /\b(?:from|join)\s+((?:`[^`]+`|[A-Za-z0-9_]+)(?:\s*\.\s*(?:`[^`]+`|[A-Za-z0-9_]+))?)/gi;
const CTE_DEFINITION =
  /(?:\bwith\s+(?:recursive\s+)?|,\s*)(`?[A-Za-z0-9_]+`?)\s+as\s*\(/gi;
const TRAILING_LIMIT =
  /\blimit\s+(\d+)(?:\s*,\s*(\d+))?(?:\s+offset\s+\d+)?\s*$/i;

/**
 * Devuelve el SQL saneado y con LIMIT garantizado, o lanza UnsafeSqlError explicando el motivo.
 */
export function assertReadOnlySql(rawSql: string, maxRows: number): string {
  const sql = rawSql
    .trim()
    .replace(/;+\s*$/, '')
    .trim();

  if (!sql) {
    throw new UnsafeSqlError('La consulta generada está vacía.');
  }

  if (sql.includes(';')) {
    throw new UnsafeSqlError('Solo se permite una sentencia SQL por consulta.');
  }

  if (sql.includes('--') || sql.includes('#') || sql.includes('/*')) {
    throw new UnsafeSqlError('La consulta no puede contener comentarios SQL.');
  }

  if (sql.includes('@@')) {
    throw new UnsafeSqlError('La consulta no puede usar variables de sistema.');
  }

  if (!/^(select|with)\b/i.test(sql)) {
    throw new UnsafeSqlError('Solo se permiten consultas de lectura (SELECT).');
  }

  assertNoSelectStar(sql);

  const forbiddenWord = FORBIDDEN_KEYWORDS.find((keyword) =>
    new RegExp(`\\b${keyword}\\b`, 'i').test(sql),
  );
  if (forbiddenWord) {
    throw new UnsafeSqlError(
      `La consulta generada contiene la palabra reservada no permitida "${forbiddenWord.toUpperCase()}".`,
    );
  }

  const forbiddenFunction = FORBIDDEN_FUNCTIONS.find((fn) =>
    new RegExp(`\\b${fn}\\s*\\(`, 'i').test(sql),
  );
  if (forbiddenFunction) {
    throw new UnsafeSqlError(
      `La consulta generada usa la función no permitida "${forbiddenFunction.toUpperCase()}()".`,
    );
  }

  assertTablesAreAllowed(sql);

  return applyRowLimit(sql, maxRows);
}

/**
 * `SELECT *` volcaría columnas que no queremos exponer (empezando por User.password, que ni
 * siquiera está en el catálogo). Se exige enumerar columnas; solo se admite `*` dentro de COUNT.
 */
function assertNoSelectStar(sql: string): void {
  const withoutCountStar = sql.replace(/\bcount\s*\(\s*\*\s*\)/gi, 'count(1)');
  if (withoutCountStar.includes('*')) {
    throw new UnsafeSqlError(
      'La consulta debe enumerar las columnas explícitamente; no se permite SELECT *.',
    );
  }
}

function assertTablesAreAllowed(sql: string): void {
  const cteNames = new Set<string>();
  for (const match of sql.matchAll(CTE_DEFINITION)) {
    cteNames.add(normalizeIdentifier(match[1]));
  }

  for (const match of sql.matchAll(TABLE_REFERENCE)) {
    const reference = match[1];

    if (reference.includes('.')) {
      throw new UnsafeSqlError(
        'No se permite consultar tablas de otra base de datos ni con nombre calificado.',
      );
    }

    const table = normalizeIdentifier(reference);
    if (!ALLOWED_TABLES.has(table) && !cteNames.has(table)) {
      throw new UnsafeSqlError(
        `La tabla "${reference}" no está disponible para consultas.`,
      );
    }
  }
}

function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/`/g, '').trim().toLowerCase();
}

function applyRowLimit(sql: string, maxRows: number): string {
  const trailingLimit = TRAILING_LIMIT.exec(sql);

  if (!trailingLimit) {
    return `${sql} LIMIT ${maxRows}`;
  }

  // `LIMIT a, b` = offset a, count b. En `LIMIT n` el count es el primer grupo.
  const count = Number(trailingLimit[2] ?? trailingLimit[1]);
  if (count <= maxRows) return sql;

  const clamped = trailingLimit[2]
    ? `LIMIT ${trailingLimit[1]}, ${maxRows}`
    : `LIMIT ${maxRows}`;
  return sql.slice(0, trailingLimit.index) + clamped;
}
