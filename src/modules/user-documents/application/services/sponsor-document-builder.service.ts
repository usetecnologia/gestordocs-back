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
export const INTRAX_SPONSOR_CODE = 'INTRAX';
export const CENET_SPONSOR_CODE = 'CENET';
export const AAG_SPONSOR_CODE = 'AAG';

const ASPIRE_SIGLAS_ORDER = ['PASSPORT', 'JOASPIRE', 'ULETTER', 'TRANSLATION'] as const;
const TRANSLATION_SIGLAS = 'TRANSLATION';

const AAG_VACATION_LETTER_SIGLAS = 'VacationLetter';
const AAG_VACATION_LETTER_FILENAME = 'VacationLetter.pdf';
const AAG_VACATION_LETTER_S3_FOLDER = 'aag-vacation-letters';
const AAG_ULETTER_SIGLAS_ORDER = ['ULETTER', 'TRANSLATION'] as const;

interface UnitedOutputSpec {
  filename: string;
  siglasList: readonly string[];
  /** Si es true, el documento se entrega con su formato original (imagen) en vez de convertirse/combinarse en PDF. */
  asImage?: boolean;
}

const UNITED_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'PROOF', siglasList: ['UWTPOSS'] },
  { filename: 'ULETTER', siglasList: ['ULETTER', 'TRANSLATION'] },
  { filename: 'PBC', siglasList: ['PBC', 'PBC2'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'JO', siglasList: ['JOUWT'] },
];

const INTRAX_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'ULETTER', siglasList: ['ULETTER'] },
  { filename: 'TRANSLATION', siglasList: ['TRANSLATION'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'PEF', siglasList: ['PEF'] },
];

const CENET_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'ULETTER', siglasList: ['ULETTER', 'TRANSLATION'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'ENGLISH', siglasList: ['CENETENGLISH'] },
  { filename: 'FEE', siglasList: ['CENETFEE'] },
  { filename: 'PHOTO', siglasList: ['PHOTO'], asImage: true },
  { filename: 'JO', siglasList: ['JOCENET'] },
];

const OTHER_IMAGE_EXTENSIONS = new Set(['gif', 'bmp', 'tiff', 'tif']);

const SEAL_WIDTH = 120;
const SEAL_MARGIN_RIGHT = 20;
const SEAL_MARGIN_BOTTOM = 90;

interface DocumentToMerge {
  siglas: string;
  /** Presente cuando el documento debe descargarse de S3. */
  url?: string;
  /** Presente cuando el documento ya está en memoria (p. ej. un archivo recién subido) y no requiere descarga. */
  bytes?: Buffer;
}

export interface NamedPdf {
  filename: string;
  buffer: Buffer;
}

export interface VacationLetterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
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

/**
 * Resuelve la extensión real de un archivo que se entrega tal cual (sin conversión a PDF),
 * a partir de su firma de bytes; si no se reconoce, recurre a la extensión de la URL.
 */
function resolveRawExtension(bytes: Buffer, url: string): string {
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
    return this.buildOutputsFor(userId, UNITED_SPONSOR_CODE, UNITED_OUTPUTS);
  }

  async buildIntraxOutputs(userId: string): Promise<NamedPdf[]> {
    return this.buildOutputsFor(userId, INTRAX_SPONSOR_CODE, INTRAX_OUTPUTS);
  }

  async buildCenetOutputs(userId: string): Promise<NamedPdf[]> {
    return this.buildOutputsFor(userId, CENET_SPONSOR_CODE, CENET_OUTPUTS);
  }

  /**
   * El VacationLetter no pertenece a ningún documento registrado del participante: se sube a S3
   * solo para dejar constancia (no se persiste su URL en ningún lado). Se llama una sola vez por
   * petición — en la descarga masiva un mismo VacationLetter se reutiliza para varios participantes.
   */
  async uploadVacationLetterRecord(vacationLetter: VacationLetterFile): Promise<void> {
    await this.awsS3Service.uploadOne(
      { ...vacationLetter, originalname: AAG_VACATION_LETTER_FILENAME },
      AAG_VACATION_LETTER_S3_FOLDER,
    );
  }

  /**
   * Combina en memoria el VacationLetter (ya subido a S3 vía uploadVacationLetterRecord) dentro
   * de ULETTER.pdf junto a ULETTER y TRANSLATION.
   */
  async buildAagOutputs(userId: string, vacationLetter: VacationLetterFile): Promise<NamedPdf[]> {
    const outputs: NamedPdf[] = [];

    const uletterDocuments = await this.collectDocuments(userId, AAG_SPONSOR_CODE, AAG_ULETTER_SIGLAS_ORDER);
    uletterDocuments.push({ siglas: AAG_VACATION_LETTER_SIGLAS, bytes: vacationLetter.buffer });
    const uletterBuffer = await this.buildMergedPdf(uletterDocuments, { applySeal: false });
    outputs.push({ filename: 'ULETTER.pdf', buffer: uletterBuffer });

    const passportDocuments = await this.collectDocuments(userId, AAG_SPONSOR_CODE, ['PASSPORT']);
    if (passportDocuments.length) {
      const buffer = await this.buildMergedPdf(passportDocuments, { applySeal: false });
      outputs.push({ filename: 'PASSPORT.pdf', buffer });
    }

    return outputs;
  }

  private async buildOutputsFor(
    userId: string,
    sponsorCode: string,
    outputSpecs: readonly UnitedOutputSpec[],
  ): Promise<NamedPdf[]> {
    const outputs: NamedPdf[] = [];

    for (const output of outputSpecs) {
      const documents = await this.collectDocuments(userId, sponsorCode, output.siglasList);
      if (!documents.length) continue;

      if (output.asImage) {
        const file = await this.buildRawFile(documents[0]);
        if (file) outputs.push({ filename: `${output.filename}.${file.extension}`, buffer: file.buffer });
        continue;
      }

      const buffer = await this.buildMergedPdf(documents, { applySeal: false });
      outputs.push({ filename: `${output.filename}.pdf`, buffer });
    }

    return outputs;
  }

  private async buildRawFile(
    document: DocumentToMerge,
  ): Promise<{ buffer: Buffer; extension: string } | null> {
    try {
      const bytes = await this.awsS3Service.downloadOne(document.url!);
      return { buffer: bytes, extension: resolveRawExtension(bytes, document.url!) };
    } catch (error) {
      this.logger.warn(
        `No se pudo procesar el documento "${document.siglas}" (${document.url}): ${getErrorMessage(error)}`,
      );
      return null;
    }
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

    for (const { siglas, url, bytes: preloadedBytes } of documents) {
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
        // Un archivo corrupto o con extensión que no coincide con su contenido real
        // no debe tumbar la combinación del resto de documentos del participante.
        this.logger.warn(
          `No se pudo procesar el documento "${siglas}" (${url ?? 'archivo en memoria'}): ${getErrorMessage(error)}`,
        );
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
