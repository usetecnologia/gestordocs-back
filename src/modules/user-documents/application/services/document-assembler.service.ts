import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import { Jimp, JimpMime } from 'jimp';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { PackageStampAnchor } from '@modules/sponsor-package/domain/sponsor-package.enums';

/**
 * Ensamblado de archivos: bajar de S3, detectar el formato real, combinar en PDF y estampar sellos.
 *
 * Esto vivía dentro de `SponsorDocumentBuilder`, mezclado con la lógica de qué documento le toca a
 * cada sponsor. Se extrajo para que el camino viejo (constantes en código) y el nuevo (configuración
 * en base) compartan **exactamente** el mismo procesamiento: así el test comparador solo tiene que
 * verificar que los dos producen el mismo plan, sin preocuparse de que uno embeba las imágenes
 * distinto que el otro.
 *
 * Nada de acá es configurable desde el admin a propósito. La detección por magic bytes, la
 * reconversión de imágenes y el manejo de archivos corruptos son comportamiento del motor: si se
 * volvieran editables, un error de configuración podría corromper archivos en vez de simplemente
 * dejarlos afuera, que es el modo de falla seguro que el código tiene hoy.
 */

const OTHER_IMAGE_EXTENSIONS = new Set(['gif', 'bmp', 'tiff', 'tif']);

/** Una fuente que entra a un archivo de salida. */
export interface DocumentToMerge {
  /**
   * Identidad de la fuente dentro del archivo, para poder decirle a un sello "solo sobre las
   * páginas de esta". El camino viejo usa la sigla; el nuevo, el `documentId`. Al motor le da igual
   * cuál sea mientras los sellos usen la misma.
   */
  key: string;
  /** Presente cuando el documento debe descargarse de S3. */
  url?: string;
  /** Presente cuando el archivo ya está en memoria (p. ej. un insumo recién adjuntado). */
  bytes?: Buffer;
}

export interface StampPlacement {
  imageBytes: Buffer;
  /** null = el sello va sobre todas las páginas del archivo. */
  onlyKey: string | null;
  widthPt: number;
  marginXPt: number;
  marginYPt: number;
  anchor: PackageStampAnchor;
}

export interface NamedPdf {
  filename: string;
  buffer: Buffer;
}

export interface MergedPdf {
  buffer: Buffer;
  /** Cuántas páginas terminó teniendo. 0 significa que ninguna fuente aportó nada. */
  pageCount: number;
}

type FileKind = 'pdf' | 'jpg' | 'png' | 'other-image' | 'unknown';

/**
 * Detecta el formato real del archivo por su firma de bytes (magic number) en vez de
 * confiar en la extensión de la URL — algunos documentos quedan guardados con una
 * extensión que no corresponde a su contenido real (p. ej. un .jpg que en realidad es PNG).
 */
export function detectFileKind(bytes: Buffer): FileKind {
  if (bytes.length < 4) return 'unknown';
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'other-image'; // GIF
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'other-image'; // BMP
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return 'other-image'; // TIFF
  }
  return 'unknown';
}

/**
 * Resuelve la extensión real de un archivo que se entrega tal cual (sin conversión a PDF),
 * a partir de su firma de bytes; si no se reconoce, recurre a la extensión de la URL.
 */
export function resolveRawExtension(bytes: Buffer, url: string): string {
  if (bytes.length >= 4) {
    if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp';
    if (
      (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
    ) {
      return 'tif';
    }
  }
  const ext = url.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

@Injectable()
export class DocumentAssembler {
  private readonly logger = new Logger(DocumentAssembler.name);

  constructor(private readonly awsS3Service: AwsS3Service) {}

  /**
   * Combina las fuentes en un solo PDF, en el orden recibido, y estampa los sellos que correspondan.
   *
   * Un archivo corrupto o con extensión que no coincide con su contenido real no debe tumbar la
   * combinación del resto: se loguea, se omite esa fuente y se sigue.
   */
  async buildMergedPdf(
    documents: readonly DocumentToMerge[],
    stamps: readonly StampPlacement[] = [],
  ): Promise<MergedPdf> {
    const merged = await PDFDocument.create();
    // Un mismo sello se embebe una sola vez por PDF aunque se estampe en muchas páginas.
    const embebidos = new Map<StampPlacement, PDFImage>();

    for (const { key, url, bytes: preloadedBytes } of documents) {
      let pages: PDFPage[] = [];

      try {
        const bytes = preloadedBytes ?? (await this.awsS3Service.downloadOne(url!));
        let kind = detectFileKind(bytes);

        if (kind === 'unknown') {
          // Firma de bytes no reconocida: se recurre a la extensión de la URL como respaldo.
          const ext = (url ?? '').split('.').pop()?.toLowerCase() ?? '';
          if (ext === 'pdf') kind = 'pdf';
          else if (ext === 'jpg' || ext === 'jpeg') kind = 'jpg';
          else if (ext === 'png') kind = 'png';
          else if (OTHER_IMAGE_EXTENSIONS.has(ext)) kind = 'other-image';
        }

        if (kind === 'pdf') {
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copiedPages = await merged.copyPages(src, src.getPageIndices());
          copiedPages.forEach((page) => merged.addPage(page));
          pages = copiedPages;
        } else if (kind === 'jpg') {
          pages = [this.addImagePage(merged, await merged.embedJpg(bytes))];
        } else if (kind === 'png') {
          pages = [this.addImagePage(merged, await merged.embedPng(bytes))];
        } else if (kind === 'other-image') {
          // pdf-lib solo embebe JPEG/PNG nativamente — el resto se reconvierte a JPEG
          // (más liviano que PNG para fotos/escaneos) antes de insertarlo.
          const image = await Jimp.read(bytes);
          const jpegBytes = await image.getBuffer(JimpMime.jpeg, { quality: 90 });
          pages = [this.addImagePage(merged, await merged.embedJpg(jpegBytes))];
        }
        // Formatos no soportados (ni pdf ni imagen) se omiten.
      } catch (error) {
        this.logger.warn(
          `No se pudo procesar el documento "${key}" (${url ?? 'archivo en memoria'}): ${getErrorMessage(error)}`,
        );
        pages = [];
      }

      if (!pages.length) continue;

      for (const stamp of stamps) {
        if (stamp.onlyKey !== null && stamp.onlyKey !== key) continue;

        let image = embebidos.get(stamp);
        if (!image) {
          image = await merged.embedPng(stamp.imageBytes);
          embebidos.set(stamp, image);
        }
        for (const page of pages) {
          this.stamp(page, image, stamp);
        }
      }
    }

    return { buffer: Buffer.from(await merged.save()), pageCount: merged.getPageCount() };
  }

  /** Baja el archivo y lo devuelve tal cual, con la extensión que dicta su contenido real. */
  async buildRawFile(
    document: DocumentToMerge,
  ): Promise<{ buffer: Buffer; extension: string } | null> {
    try {
      const bytes = document.bytes ?? (await this.awsS3Service.downloadOne(document.url!));
      return { buffer: bytes, extension: resolveRawExtension(bytes, document.url ?? '') };
    } catch (error) {
      this.logger.warn(
        `No se pudo procesar el documento "${document.key}" (${document.url}): ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /** Baja una imagen de sello de S3. Devuelve null si no se puede: el archivo sale sin sello. */
  async downloadStampAsset(assetUrl: string): Promise<Buffer | null> {
    try {
      return await this.awsS3Service.downloadOne(assetUrl);
    } catch (error) {
      this.logger.warn(`No se pudo descargar el sello "${assetUrl}": ${getErrorMessage(error)}`);
      return null;
    }
  }

  private addImagePage(doc: PDFDocument, image: PDFImage): PDFPage {
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return page;
  }

  private stamp(page: PDFPage, image: PDFImage, placement: StampPlacement): void {
    const width = placement.widthPt;
    const height = (image.height * width) / image.width;

    const derecha = page.getWidth() - width - placement.marginXPt;
    const arriba = page.getHeight() - height - placement.marginYPt;

    const { x, y } = {
      [PackageStampAnchor.BOTTOM_RIGHT]: { x: derecha, y: placement.marginYPt },
      [PackageStampAnchor.BOTTOM_LEFT]: { x: placement.marginXPt, y: placement.marginYPt },
      [PackageStampAnchor.TOP_RIGHT]: { x: derecha, y: arriba },
      [PackageStampAnchor.TOP_LEFT]: { x: placement.marginXPt, y: arriba },
    }[placement.anchor];

    page.drawImage(image, { x, y, width, height });
  }
}
