/** Valor de celda ya normalizado a algo serializable en JSON. */
export type QueryCellValue = string | number | boolean | null;

export type QueryRow = Record<string, QueryCellValue>;

export class NlQueryResult {
  constructor(
    public readonly question: string,
    public readonly sql: string,
    public readonly explanation: string,
    public readonly columns: string[],
    public readonly rows: QueryRow[],
    public readonly rowCount: number,
    public readonly truncated: boolean,
    public readonly executionMs: number,
  ) {}
}
