import { type Canvas, createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Prepara el archivo antes de mandarlo a la IA. La lectura falla mucho más por la imagen que por
 * el modelo: con un pasaporte fotografiado de costado, la IA leía otro país y otros apellidos, y
 * la misma imagen enderezada salía perfecta. Por eso:
 *
 *  - los PDF se convierten a imagen aquí, a resolución controlada, en vez de dejar que el
 *    proveedor los rasterice a su manera;
 *  - toda imagen se re-codifica, así lo que ve la IA son exactamente los píxeles que giramos;
 *  - se ofrece girar y recortar la franja inferior (la MRZ) para mandarla ampliada.
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

interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvas: unknown; canvasContext: unknown; viewport: PdfViewport }): {
    promise: Promise<void>;
  };
  cleanup(): void;
}
interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
interface PdfjsModule {
  getDocument(options: { data: Uint8Array; isEvalSupported: boolean; disableFontFace: boolean }): {
    promise: Promise<PdfDocument>;
  };
}

// pdfjs-dist solo se publica como ESM y el proyecto compila a CommonJS: TypeScript convertiría un
// `import()` normal en `require()`, que no puede cargarlo. Así el import dinámico llega intacto.
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- especificador fijo, no es eval de datos externos
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= importEsm('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfjsModule>;
  return pdfjsPromise;
}

function encode(canvas: Canvas): PreparedImage {
  return { data: canvas.toBuffer('image/jpeg', JPEG_QUALITY), width: canvas.width, height: canvas.height };
}

async function renderPdfPages(buffer: Buffer): Promise<{ pages: PreparedImage[]; totalPages: number }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  try {
    const pages: PreparedImage[] = [];
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_LONG_EDGE_PX / Math.max(base.width, base.height) });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(encode(canvas));
      page.cleanup();
    }
    return { pages, totalPages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

async function normalizeImage(buffer: Buffer): Promise<PreparedImage> {
  const image = await loadImage(buffer);
  // Solo se reduce: agrandar no agrega información y encarece la llamada.
  const scale = Math.min(1, RENDER_LONG_EDGE_PX / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

/** Páginas del archivo como imágenes. Un PDF da hasta 4 páginas; una imagen, una. */
export async function preparePages(
  buffer: Buffer,
  contentType: string,
): Promise<{ pages: PreparedImage[]; totalPages: number }> {
  if (contentType === 'application/pdf') return renderPdfPages(buffer);
  return { pages: [await normalizeImage(buffer)], totalPages: 1 };
}

export async function rotateClockwise(image: PreparedImage, degrees: ClockwiseRotation): Promise<PreparedImage> {
  if (degrees === 0) return image;
  const source = await loadImage(image.data);
  const swap = degrees === 90 || degrees === 270;
  const canvas = createCanvas(swap ? source.height : source.width, swap ? source.width : source.height);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return encode(canvas);
}

export async function cropMrzBand(image: PreparedImage): Promise<PreparedImage> {
  const source = await loadImage(image.data);
  const bandHeight = Math.round(source.height * MRZ_BAND_RATIO);
  const canvas = createCanvas(source.width, bandHeight);
  canvas
    .getContext('2d')
    .drawImage(source, 0, source.height - bandHeight, source.width, bandHeight, 0, 0, source.width, bandHeight);
  return encode(canvas);
}

export async function thumbnail(image: PreparedImage): Promise<PreparedImage> {
  const source = await loadImage(image.data);
  const scale = Math.min(1, THUMBNAIL_LONG_EDGE_PX / Math.max(source.width, source.height));
  const canvas = createCanvas(Math.round(source.width * scale), Math.round(source.height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return encode(canvas);
}

export function toDataUri(image: PreparedImage): string {
  return `data:image/jpeg;base64,${image.data.toString('base64')}`;
}
