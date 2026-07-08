import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  ASPIRE_SPONSOR_CODE,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
} from '../services/sponsor-document-builder.service';

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
    private readonly sponsorDocumentBuilder: SponsorDocumentBuilder,
  ) {}

  async execute(userId: string): Promise<DownloadDocumentsBySponsorResult> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(userId);
    if (!participant) throw new NotFoundException(`Participante #${userId} no encontrado.`);

    if (participant.sponsorCode === ASPIRE_SPONSOR_CODE) {
      const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant);
      const buffer = await this.sponsorDocumentBuilder.buildAspirePdf(userId);
      if (!buffer) {
        throw new NotFoundException('El participante no tiene documentos subidos para combinar.');
      }
      return { buffer, filename: `${baseFilename}.pdf`, contentType: 'application/pdf' };
    }

    if (participant.sponsorCode === UNITED_SPONSOR_CODE) {
      const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
      const outputs = await this.sponsorDocumentBuilder.buildUnitedOutputs(userId);
      if (!outputs.length) {
        throw new NotFoundException('El participante no tiene documentos subidos para combinar.');
      }

      const zip = new JSZip();
      const folder = zip.folder(baseFilename)!;
      outputs.forEach(({ filename, buffer }) => folder.file(filename, buffer));

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      return { buffer, filename: `${baseFilename}.zip`, contentType: 'application/zip' };
    }

    throw new BadRequestException(
      `El participante no pertenece a un sponsor soportado (${ASPIRE_SPONSOR_CODE} o ${UNITED_SPONSOR_CODE}).`,
    );
  }
}
