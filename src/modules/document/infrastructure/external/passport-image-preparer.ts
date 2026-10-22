import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Jimp, JimpMime } from 'jimp';

/**
 * Prepara el archivo antes de mandarlo a la IA. La lectura falla mucho más por la imagen que por
 * el modelo: con un pasaporte fotografiado de costado, la IA leía otro país y otros apellidos, y
 * la misma imagen enderezada salía perfecta. Por eso:
 *
 *  - los PDF se convierten a imagen aquí, a resolución controlada, en vez de dejar que el
 *    proveedor los rasterice a su manera;
 *  - toda imagen se re-codifica, así lo que ve la IA son exactamente los píxeles que giramos;
 *  - se ofrece girar y recortar la franja inferior (la MRZ) para mandarla ampliada.
 *
 * Sin librerías de imagen nativas a propósito: @napi-rs/canvas (y pdfjs-dist, que lo usa por
 * dentro) traen binarios compilados con AVX/SSE4.2, y en el VPS (CPU "QEMU Virtual CPU", sin
 * esas instrucciones) el proceso moría con "Illegal instruction" (exit 132) al arrancar, sin
 * dejar ningún log. Las imágenes van con Jimp (JavaScript puro) y los PDF con `pdftoppm` de
 * poppler-utils, que el Dockerfile instala desde Alpine (compilado para x86-64 genérico).
 * En local, para leer PDF hace falta tener poppler en el PATH.
 */

export interface PreparedImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

export type ClockwiseRotation = 0 | 90 | 180 | 270;

/** Lado largo al rasterizar: suficiente para leer la MRZ sin mandar archivos enormes. */
const RENDER_LONG_EDGE_PX = 2400;
const THUMBNAIL_LONG_EDGE_PX = 768;
const MAX_PDF_PAGES = 4;
const JPEG_QUALITY = 92;
/** La MRZ ocupa el pie de la página de datos; un tercio deja margen si la foto incluye bordes. */
const MRZ_BAND_RATIO = 0.34;
/** Un PDF de pasaporte se rasteriza en un par de segundos; más que esto es un archivo patológico. */
const POPPLER_TIMEOUT_MS = 60_000;

const execFileAsync = promisify(execFile);

type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

async function encode(image: JimpImage): Promise<PreparedImage> {
  const data = await image.getBuffer(JimpMime.jpeg, { quality: JPEG_QUALITY });
  return { data, width: image.width, height: image.height };
}

/** Solo se reduce: agrandar no agrega información y encarece la llamada. Modifica la imagen. */
function shrinkToLongEdge(image: JimpImage, longEdge: number): void {
  const scale = Math.min(1, longEdge / Math.max(image.width, image.height));
  if (scale < 1)
    image.resize({
      w: Math.round(image.width * scale),
      h: Math.round(image.height * scale),
    });
}

async function runPoppler(
  command: 'pdfinfo' | 'pdftoppm',
  args: string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: POPPLER_TIMEOUT_MS,
    });
    return stdout;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `no está instalado "${command}" (paquete poppler-utils), necesario para leer PDF`,
      );
    }
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (err as Error).message);
  }
}

async function renderPdfPages(
  buffer: Buffer,
): Promise<{ pages: PreparedImage[]; totalPages: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'passport-pdf-'));
  try {
    const input = join(dir, 'input.pdf');
    await writeFile(input, buffer);

    const info = await runPoppler('pdfinfo', [input]);
    const totalPages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
    if (totalPages === 0) return { pages: [], totalPages: 0 };

    // -scale-to fija el lado largo; el fondo de la página ya sale blanco.
    await runPoppler('pdftoppm', [
      '-jpeg',
      '-jpegopt',
      `quality=${JPEG_QUALITY}`,
      '-scale-to',
      String(RENDER_LONG_EDGE_PX),
      '-f',
      '1',
      '-l',
      String(Math.min(totalPages, MAX_PDF_PAGES)),
      input,
      join(dir, 'page'),
    ]);

    // pdftoppm nombra page-1.jpg, page-01.jpg… según la cantidad de páginas: se ordena por número.
    const files = (await readdir(dir))
      .filter((name) => /^page-\d+\.jpg$/.test(name))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));

    const pages: PreparedImage[] = [];
    for (const name of files) {
      const data = await readFile(join(dir, name));
      const image = await Jimp.read(data);
      pages.push({ data, width: image.width, height: image.height });
    }
    return { pages, totalPages };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function normalizeImage(buffer: Buffer): Promise<PreparedImage> {
  const image = await Jimp.read(buffer);
  shrinkToLongEdge(image, RENDER_LONG_EDGE_PX);
  return encode(image);
}

/** Páginas del archivo como imágenes. Un PDF da hasta 4 páginas; una imagen, una. */
export async function preparePages(
  buffer: Buffer,
  contentType: string,
): Promise<{ pages: PreparedImage[]; totalPages: number }> {
  if (contentType === 'application/pdf') return renderPdfPages(buffer);
  return { pages: [await normalizeImage(buffer)], totalPages: 1 };
}

export async function rotateClockwise(
  image: PreparedImage,
  degrees: ClockwiseRotation,
): Promise<PreparedImage> {
  if (degrees === 0) return image;
  const source = await Jimp.read(image.data);
  // Jimp gira en sentido antihorario con grados positivos.
  source.rotate(-degrees);
  return encode(source);
}

export async function cropMrzBand(
  image: PreparedImage,
): Promise<PreparedImage> {
  const source = await Jimp.read(image.data);
  const bandHeight = Math.round(source.height * MRZ_BAND_RATIO);
  source.crop({
    x: 0,
    y: source.height - bandHeight,
    w: source.width,
    h: bandHeight,
  });
  return encode(source);
}

export async function thumbnail(image: PreparedImage): Promise<PreparedImage> {
  const source = await Jimp.read(image.data);
  shrinkToLongEdge(source, THUMBNAIL_LONG_EDGE_PX);
  return encode(source);
}

export function toDataUri(image: PreparedImage): string {
  return `data:image/jpeg;base64,${image.data.toString('base64')}`;
}
