/**
 * Detección del tipo real de un archivo por su firma de bytes (magic bytes).
 *
 * El nombre con el que llega un archivo miente con frecuencia: es habitual recibir un JPEG llamado
 * "pasaporte.pdf" o un PDF llamado "dni.jpg". Como el navegador decide cómo mostrar un archivo por
 * el Content-Type que declara el servidor —no por la extensión de la URL—, guardarlo con el tipo
 * deducido del nombre deja archivos irreproducibles: Chrome abre el visor de PDF y encuentra un
 * JPEG, o intenta renderizar como imagen algo que es un PDF.
 *
 * Los bytes iniciales, en cambio, no mienten.
 */

export interface DetectedFileType {
  contentType: string;
  /** Extensión canónica del formato, sin punto. */
  extension: string;
}

interface FileSignature extends DetectedFileType {
  minLength: number;
  matches: (bytes: Buffer) => boolean;
}

const ascii = (bytes: Buffer, start: number, end: number): string =>
  bytes.subarray(start, end).toString('latin1');

const SIGNATURES: FileSignature[] = [
  {
    contentType: 'application/pdf',
    extension: 'pdf',
    minLength: 4,
    matches: (b) => ascii(b, 0, 4) === '%PDF',
  },
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    minLength: 3,
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    minLength: 8,
    matches: (b) => ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n',
  },
  {
    contentType: 'image/gif',
    extension: 'gif',
    minLength: 6,
    matches: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    minLength: 12,
    matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
  {
    // HEIC/HEIF — el formato por defecto de las fotos de iPhone, común en documentos escaneados
    // desde el celular. La marca "ftyp" va precedida por el tamaño de la caja, en los bytes 4-8.
    contentType: 'image/heic',
    extension: 'heic',
    minLength: 12,
    matches: (b) =>
      ascii(b, 4, 8) === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(
        ascii(b, 8, 12),
      ),
  },
  {
    contentType: 'image/tiff',
    extension: 'tiff',
    minLength: 4,
    matches: (b) =>
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a),
  },
  {
    contentType: 'image/bmp',
    extension: 'bmp',
    // La firma es de solo 2 caracteres; se exige además la cabecera BMP completa (14 bytes) para
    // no confundir con cualquier archivo que empiece con "BM".
    minLength: 14,
    matches: (b) => ascii(b, 0, 2) === 'BM',
  },
];

/** Tipo real del archivo, o `null` si su firma no corresponde a ningún formato conocido. */
export function detectFileType(bytes: Buffer): DetectedFileType | null {
  const found = SIGNATURES.find(
    (s) => bytes.length >= s.minLength && s.matches(bytes),
  );
  return found
    ? { contentType: found.contentType, extension: found.extension }
    : null;
}

/** Extensión declarada en un nombre de archivo, en minúsculas y sin punto. */
export function extensionFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return null;
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Variantes que designan el mismo formato. Aparecen en archivos ya subidos al bucket y compararlas
 * como strings distintos produce diferencias que no existen: `image/pjpeg` es un alias histórico de
 * JPEG e `image/jpg` no forma parte del estándar, pero se declara con frecuencia.
 */
const CONTENT_TYPE_ALIASES: Record<string, string> = {
  'image/pjpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/heif': 'image/heic',
  'application/x-pdf': 'application/pdf',
};

/** Content-Type en minúsculas, sin parámetros (`; charset=…`) y con los alias unificados. */
export function normalizeContentType(value: string): string {
  const bare = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return CONTENT_TYPE_ALIASES[bare] ?? bare;
}

/** Cómo trata el navegador un Content-Type a la hora de mostrar el archivo. */
export type RenderingFamily = 'image' | 'pdf' | 'other';

export function renderingFamily(contentType: string): RenderingFamily {
  const normalized = normalizeContentType(contentType);
  if (normalized === 'application/pdf') return 'pdf';
  if (normalized.startsWith('image/')) return 'image';
  return 'other';
}

/**
 * `true` si servir el archivo como `declared` cuando en realidad es `detected` impide verlo.
 *
 * No basta con que los dos tipos difieran: los navegadores hacen *sniffing* dentro de las imágenes,
 * así que un PNG servido como `image/jpeg` se muestra perfectamente y observar por eso es observar
 * por nada — en la corrida del 4/8/2026, 30 de los 35 mismatches detectados eran de ese tipo. Lo que
 * sí rompe la visualización es cruzar la frontera entre familias: un PDF servido como imagen (o al
 * revés) va al visor equivocado y no se muestra.
 */
export function breaksRendering(declared: string, detected: string): boolean {
  return renderingFamily(declared) !== renderingFamily(detected);
}
