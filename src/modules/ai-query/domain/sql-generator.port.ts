export interface GeneratedSql {
  /** SQL propuesto por el modelo, o null si la pregunta no puede responderse con un SELECT. */
  readonly sql: string | null;
  /** Explicación breve, en español, de qué devuelve la consulta. */
  readonly explanation: string;
  /** Motivo por el que el modelo no generó SQL (pregunta ambigua, pide escritura, fuera de alcance). */
  readonly rejectionReason: string | null;
}

export interface ISqlGeneratorPort {
  generate(question: string, maxRows: number): Promise<GeneratedSql>;
}

export const SQL_GENERATOR_PORT = Symbol('SQL_GENERATOR_PORT');
