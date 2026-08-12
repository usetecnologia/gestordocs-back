/**
 * Recorte de texto respetando el límite en BYTES de las columnas de MySQL/MariaDB.
 *
 * El límite de una columna de texto se cuenta en bytes, no en caracteres, y en utf8mb4 un carácter
 * ocupa entre 1 y 4 bytes: una observación con acentos o emojis puede caber "en caracteres" y aun
 * así reventar el INSERT. Cuando eso pasa dentro de una transacción, se pierde todo el trabajo del
 * bloque —no solo la observación—, que es exactamente lo que ocurrió en la revisión masiva de
 * pasaportes del 4/8/2026: 9 observaciones se perdieron con la transacción completa por exceder
 * el varchar(191) de `UserDocumentHistory.observation`.
 */

/** Capacidad de una columna `TEXT` de MySQL/MariaDB, en bytes. */
export const MYSQL_TEXT_MAX_BYTES = 65535;

/**
 * Recorta `value` para que su representación UTF-8 no exceda `maxBytes`, sin partir un carácter
 * por la mitad (un corte a mitad de secuencia produciría bytes inválidos). Devuelve el mismo
 * string si ya cabe.
 */
export function truncateToBytes(
  value: string,
  maxBytes: number = MYSQL_TEXT_MAX_BYTES,
): string {
  if (maxBytes <= 0) return '';

  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return value;

  // Los bytes de continuación de UTF-8 tienen la forma 10xxxxxx. Si el primer byte descartado es
  // uno de ellos, el corte cae dentro de un carácter: hay que retroceder hasta su inicio.
  let end = maxBytes;
  while (end > 0 && (bytes[end] & 0b1100_0000) === 0b1000_0000) end--;

  return bytes.subarray(0, end).toString('utf8');
}

/** `true` si el texto no cabe en `maxBytes` una vez codificado en UTF-8. */
export function exceedsByteLimit(
  value: string,
  maxBytes: number = MYSQL_TEXT_MAX_BYTES,
): boolean {
  return Buffer.byteLength(value, 'utf8') > maxBytes;
}
