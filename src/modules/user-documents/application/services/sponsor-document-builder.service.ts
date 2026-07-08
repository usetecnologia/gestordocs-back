import { Inject, Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import { Jimp, JimpMime } from 'jimp';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { SELLO_TRANSLATION_PNG_BASE64 } from '../../infrastructure/assets/sello-translation.constant';

export const ASPIRE_SPONSOR_CODE = 'ASPIRE';
export const UNITED_SPONSOR_CODE = 'UNITED';

const ASPIRE_SIGLAS_ORDER = ['PASSPORT', 'JOASPIRE', 'ULETTER', 'TRANSLATION'] as const;
const TRANSLATION_SIGLAS = 'TRANSLATION';

interface UnitedOutputSpec {
  filename: string;
  siglasList: readonly string[];
}

const UNITED_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'PROOF', siglasList: ['UWTPOSS'] },
  { filename: 'ULETTER', siglasList: ['ULETTER', 'TRANSLATION'] },
  { filename: 'PBC', siglasList: ['PBC', 'PBC2'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'JO', siglasList: ['JOUWT'] },
];

const OTHER_IMAGE_EXTENSIONS = new Set(['gif', 'bmp', 'tiff', 'tif']);

const SEAL_WIDTH = 120;
const SEAL_MARGIN_RIGHT = 20;
const SEAL_MARGIN_BOTTOM = 90;

interface DocumentToMerge {
  siglas: string;
  url: string;
}

export interface NamedPdf {
  filename: string;
  buffer: Buffer;
}

type FileKind = 'pdf' | 'jpg' | 'png' | 'other-image' | 'unknown';

/**
 * Detecta el formato real del archivo por su firma de bytes (magic number) en vez de
 * confiar en la extensión de la URL — algunos documentos quedan guardados con una
 * extensión que no corresponde a su contenido real (p. ej. un .jpg que en realidad es PNG).
 */
function detectFileKind(bytes: Buffer): FileKind {
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

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Centraliza la lógica de armado de documentos por sponsor (ASPIRE/UNITED)
 * para que la descarga individual y la descarga masiva compartan el mismo comportamiento.
 */
@Injectable()
export class SponsorDocumentBuilder {
  private readonly logger = new Logger(SponsorDocumentBuilder.name);

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  buildBaseFilename(participant: ParticipantSponsorInfo, separator = '_'): string {
    const apellidos = [participant.lastfathername, participant.lastmothername]
      .filter(Boolean)
      .join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');
    return `${participant.dni ?? participant.id}${separator}${apellidos}, ${nombres}`;
  }

  async buildAspirePdf(userId: string): Promise<Buffer | null> {
    const documents = await this.collectDocuments(userId, ASPIRE_SPONSOR_CODE, ASPIRE_SIGLAS_ORDER);
    if (!documents.length) return null;
    return this.buildMergedPdf(documents, { applySeal: true });
  }

  async buildUnitedOutputs(userId: string): Promise<NamedPdf[]> {
    const outputs: NamedPdf[] = [];

    for (const output of UNITED_OUTPUTS) {
      const documents = await this.collectDocuments(userId, UNITED_SPONSOR_CODE, output.siglasList);
      if (!documents.length) continue;

      const buffer = await this.buildMergedPdf(documents, { applySeal: false });
      outputs.push({ filename: `${output.filename}.pdf`, buffer });
    }

    return outputs;
  }

  private async collectDocuments(
    userId: string,
    sponsorCode: string,
    siglasList: readonly string[],
  ): Promise<DocumentToMerge[]> {
    const documents: DocumentToMerge[] = [];

    for (const siglas of siglasList) {
      const target = await this.userDocumentsRepo.findDocumentTargetBySiglasCode(siglas, sponsorCode);
      if (!target.found || !target.applicable) continue;

      const history = await this.userDocumentsRepo.findHistoryByUserAndTarget(
        userId,
        target.documentId,
        target.documentSponsorId,
      );
      const lastEntry = history[history.length - 1];
      if (!lastEntry?.url) continue;

      documents.push({ siglas, url: lastEntry.url });
    }

    return documents;
  }

  private async buildMergedPdf(
    documents: DocumentToMerge[],
    options: { applySeal: boolean },
  ): Promise<Buffer> {
    const merged = await PDFDocument.create();
    let sealImage: PDFImage | undefined;

    for (const { siglas, url } of documents) {
      let pages: PDFPage[] = [];

      try {
        const bytes = await this.awsS3Service.downloadOne(url);
        let kind = detectFileKind(bytes);

        if (kind === 'unknown') {
          // Firma de bytes no reconocida: se recurre a la extensión de la URL como respaldo.
          const ext = url.split('.').pop()?.toLowerCase() ?? '';
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
        // Un archivo corrupto o con extensión que no coincide con su contenido real
        // no debe tumbar la combinación del resto de documentos del participante.
        this.logger.warn(`No se pudo procesar el documento "${siglas}" (${url}): ${getErrorMessage(error)}`);
        pages = [];
      }

      if (options.applySeal && siglas === TRANSLATION_SIGLAS && pages.length) {
        sealImage ??= await merged.embedPng(Buffer.from(SELLO_TRANSLATION_PNG_BASE64, 'base64'));
        for (const page of pages) {
          this.stampSeal(page, sealImage);
        }
      }
    }

    return Buffer.from(await merged.save());
  }

  private addImagePage(doc: PDFDocument, image: PDFImage): PDFPage {
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return page;
  }

  private stampSeal(page: PDFPage, sealImage: PDFImage): void {
    const scale = SEAL_WIDTH / sealImage.width;
    const sealHeight = sealImage.height * scale;

    page.drawImage(sealImage, {
      x: page.getWidth() - SEAL_WIDTH - SEAL_MARGIN_RIGHT,
      y: SEAL_MARGIN_BOTTOM,
      width: SEAL_WIDTH,
      height: sealHeight,
    });
  }
}
