/**
 * Normaliza un query param que admite varios valores: `?ids=a,b` o `?ids=a&ids=b`.
 *
 * Devuelve `undefined` cuando no queda ningún valor útil, para que `@IsOptional()` lo trate como
 * "sin filtro" en vez de como una lista vacía (que en Prisma haría `in: []` y no matchearía nada).
 */
export function toIdList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const ids = raw.map((item) => String(item).trim()).filter(Boolean);
  return ids.length ? [...new Set(ids)] : undefined;
}
