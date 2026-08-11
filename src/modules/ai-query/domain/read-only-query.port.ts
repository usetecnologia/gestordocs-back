export interface IReadOnlyQueryPort {
  /**
   * Ejecuta un SELECT ya validado. La implementación usa una conexión independiente que, si el
   * despliegue define credenciales de solo lectura, no tiene privilegios de escritura.
   */
  run(sql: string, timeoutMs: number): Promise<Record<string, unknown>[]>;
}

export const READ_ONLY_QUERY_PORT = Symbol('READ_ONLY_QUERY_PORT');
