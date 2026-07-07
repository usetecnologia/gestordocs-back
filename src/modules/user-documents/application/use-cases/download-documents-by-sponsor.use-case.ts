import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFImage, PDFPage } from 'pdf-lib';
import sharp from 'sharp';
import JSZip from 'jszip';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { SELLO_TRANSLATION_PNG_BASE64 } from '../../infrastructure/assets/sello-translation.constant';

const ASPIRE_SPONSOR_CODE = 'ASPIRE';
const UNITED_SPONSOR_CODE = 'UNITED';

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
  { filename: 'JO', siglasList: ['SPONSOR'] },
];

const OTHER_IMAGE_EXTENSIONS = new Set(['webp', 'gif', 'bmp', 'tiff', 'tif', 'avif']);

const SEAL_WIDTH = 120;
const SEAL_MARGIN_RIGHT = 20;
const SEAL_MARGIN_BOTTOM = 90;

interface DocumentToMerge {
  siglas: string;
  url: string;
}

interface ParticipantInfo {
  id: string;
  dni: string | null;
  firstname: string;
  middlename: string | null;
  lastfathername: string;
  lastmothername: string | null;
  sponsorCode: string | null;
}

export interface DownloadDocumentsBySponsorResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

@Injectable()
export class DownloadDocumentsBySponsorUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(userId: string): Promise<DownloadDocumentsBySponsorResult> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(userId);
    if (!participant) throw new NotFoundException(`Participante #${userId} no encontrado.`);

    const baseFilename = this.buildBaseFilename(participant);

    if (participant.sponsorCode === ASPIRE_SPONSOR_CODE) {
      const documents = await this.collectDocuments(userId, ASPIRE_SPONSOR_CODE, ASPIRE_SIGLAS_ORDER);
      if (!documents.length) {
        throw new NotFoundException('El participante no tiene documentos subidos para combinar.');
      }
      const buffer = await this.buildMergedPdf(documents, { applySeal: true });
      return { buffer, filename: `${baseFilename}.pdf`, contentType: 'application/pdf' };
    }

    if (participant.sponsorCode === UNITED_SPONSOR_CODE) {
      const buffer = await this.buildUnitedZip(userId, baseFilename);
      return { buffer, filename: `${baseFilename}.zip`, contentType: 'application/zip' };
    }

    throw new BadRequestException(
      `El participante no pertenece a un sponsor soportado (${ASPIRE_SPONSOR_CODE} o ${UNITED_SPONSOR_CODE}).`,
    );
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

  private async buildUnitedZip(userId: string, folderName: string): Promise<Buffer> {
    const zip = new JSZip();
    const folder = zip.folder(folderName)!;
    let hasAnyFile = false;

    for (const output of UNITED_OUTPUTS) {
      const documents = await this.collectDocuments(userId, UNITED_SPONSOR_CODE, output.siglasList);
      if (!documents.length) continue;

      const pdfBuffer = await this.buildMergedPdf(documents, { applySeal: false });
      folder.file(`${output.filename}.pdf`, pdfBuffer);
      hasAnyFile = true;
    }

    if (!hasAnyFile) {
      throw new NotFoundException('El participante no tiene documentos subidos para combinar.');
    }

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  private async buildMergedPdf(
    documents: DocumentToMerge[],
    options: { applySeal: boolean },
  ): Promise<Buffer> {
    const merged = await PDFDocument.create();
    let sealImage: PDFImage | undefined;

    for (const { siglas, url } of documents) {
      const bytes = await this.awsS3Service.downloadOne(url);
      const ext = url.split('.').pop()?.toLowerCase() ?? '';

      let pages: PDFPage[] = [];

      if (ext === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await merged.copyPages(src, src.getPageIndices());
        copiedPages.forEach((page) => merged.addPage(page));
        pages = copiedPages;
      } else if (ext === 'jpg' || ext === 'jpeg') {
        pages = [this.addImagePage(merged, await merged.embedJpg(bytes))];
      } else if (ext === 'png') {
        pages = [this.addImagePage(merged, await merged.embedPng(bytes))];
      } else if (OTHER_IMAGE_EXTENSIONS.has(ext)) {
        // pdf-lib solo embebe JPEG/PNG nativamente — el resto se reconvierte a JPEG
        // (más liviano que PNG para fotos/escaneos) antes de insertarlo.
        const jpegBytes = await sharp(bytes).jpeg({ quality: 90 }).toBuffer();
        pages = [this.addImagePage(merged, await merged.embedJpg(jpegBytes))];
      }
      // Formatos no soportados (ni pdf ni imagen) se omiten.

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

  private buildBaseFilename(participant: ParticipantInfo): string {
    const apellidos = [participant.lastfathername, participant.lastmothername]
      .filter(Boolean)
      .join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');
    return `${participant.dni ?? participant.id}_${apellidos}, ${nombres}`;
  }
}
