import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';

const REQUIRED_SPONSOR_CODE = 'ASPIRE';

const SIGLAS_ORDER = ['PASSPORT', 'JOASPIRE', 'ULETTER', 'TRANSLATION'] as const;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

export interface DownloadDocumentsBySponsorResult {
  buffer: Buffer;
  filename: string;
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

    if (participant.sponsorCode !== REQUIRED_SPONSOR_CODE) {
      throw new BadRequestException(
        `El participante no pertenece al sponsor ${REQUIRED_SPONSOR_CODE}.`,
      );
    }

    const urlsToMerge: string[] = [];
    for (const siglas of SIGLAS_ORDER) {
      const target = await this.userDocumentsRepo.findDocumentTargetBySiglasCode(
        siglas,
        REQUIRED_SPONSOR_CODE,
      );
      if (!target.found || !target.applicable) continue;

      const history = await this.userDocumentsRepo.findHistoryByUserAndTarget(
        userId,
        target.documentId,
        target.documentSponsorId,
      );
      const lastEntry = history[history.length - 1];
      if (!lastEntry?.url) continue;

      urlsToMerge.push(lastEntry.url);
    }

    if (!urlsToMerge.length) {
      throw new NotFoundException('El participante no tiene documentos subidos para combinar.');
    }

    const buffer = await this.buildMergedPdf(urlsToMerge);
    const filename = this.buildFilename(participant);

    return { buffer, filename };
  }

  private async buildMergedPdf(urls: string[]): Promise<Buffer> {
    const merged = await PDFDocument.create();

    for (const url of urls) {
      const bytes = await this.awsS3Service.downloadOne(url);
      const ext = url.split('.').pop()?.toLowerCase() ?? '';

      if (ext === 'pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        const image = ext === 'png' ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
        const page = merged.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      }
      // Formatos no soportados (ni pdf ni imagen) se omiten.
    }

    return Buffer.from(await merged.save());
  }

  private buildFilename(participant: {
    id: string;
    dni: string | null;
    firstname: string;
    middlename: string | null;
    lastfathername: string;
    lastmothername: string | null;
  }): string {
    const apellidos = [participant.lastfathername, participant.lastmothername]
      .filter(Boolean)
      .join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');
    return `${participant.dni ?? participant.id}_${apellidos}, ${nombres}.pdf`;
  }
}
