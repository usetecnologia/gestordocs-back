import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  AAG_SPONSOR_CODE,
  ASPIRE_SPONSOR_CODE,
  CENET_SPONSOR_CODE,
  INTEREXCHANGE_SPONSOR_CODE,
  INTRAX_SPONSOR_CODE,
  NamedPdf,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
  VacationLetterFile,
} from '../services/sponsor-document-builder.service';

export interface DownloadDocumentsBySponsorResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const NO_DOCUMENTS_MESSAGE = 'El participante no tiene documentos subidos para combinar.';

@Injectable()
export class DownloadDocumentsBySponsorUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly sponsorDocumentBuilder: SponsorDocumentBuilder,
  ) {}

  async execute(
    userId: string,
    vacationLetter?: VacationLetterFile,
  ): Promise<DownloadDocumentsBySponsorResult> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(userId);
    if (!participant) throw new NotFoundException(`Participante #${userId} no encontrado.`);

    if (participant.sponsorCode === ASPIRE_SPONSOR_CODE) {
      const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant);
      const buffer = await this.sponsorDocumentBuilder.buildAspirePdf(userId);
      if (!buffer) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return { buffer, filename: `${baseFilename}.pdf`, contentType: 'application/pdf' };
    }

    if (participant.sponsorCode === UNITED_SPONSOR_CODE) {
      const outputs = await this.sponsorDocumentBuilder.buildUnitedOutputs(userId);
      if (!outputs.length) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return this.buildZipResult(participant, outputs);
    }

    if (participant.sponsorCode === INTRAX_SPONSOR_CODE) {
      const outputs = await this.sponsorDocumentBuilder.buildIntraxOutputs(userId);
      if (!outputs.length) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return this.buildZipResult(participant, outputs);
    }

    if (participant.sponsorCode === CENET_SPONSOR_CODE) {
      const outputs = await this.sponsorDocumentBuilder.buildCenetOutputs(userId);
      if (!outputs.length) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return this.buildZipResult(participant, outputs);
    }

    if (participant.sponsorCode === INTEREXCHANGE_SPONSOR_CODE) {
      const outputs = await this.sponsorDocumentBuilder.buildInterexchangeOutputs(userId);
      if (!outputs.length) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return this.buildZipResult(participant, outputs);
    }

    if (participant.sponsorCode === AAG_SPONSOR_CODE) {
      if (!vacationLetter) {
        throw new BadRequestException(
          'El PDF de VacationLetter es obligatorio para participantes del sponsor AAG.',
        );
      }
      await this.sponsorDocumentBuilder.uploadVacationLetterRecord(vacationLetter);
      const outputs = await this.sponsorDocumentBuilder.buildAagOutputs(userId, vacationLetter);
      if (!outputs.length) throw new NotFoundException(NO_DOCUMENTS_MESSAGE);
      return this.buildZipResult(participant, outputs);
    }

    throw new BadRequestException(
      `El participante no pertenece a un sponsor soportado (${ASPIRE_SPONSOR_CODE}, ${UNITED_SPONSOR_CODE}, ` +
        `${INTRAX_SPONSOR_CODE}, ${CENET_SPONSOR_CODE}, ${AAG_SPONSOR_CODE} o ${INTEREXCHANGE_SPONSOR_CODE}).`,
    );
  }

  private async buildZipResult(
    participant: ParticipantSponsorInfo,
    outputs: NamedPdf[],
  ): Promise<DownloadDocumentsBySponsorResult> {
    const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
    const zip = new JSZip();
    const folder = zip.folder(baseFilename)!;
    outputs.forEach(({ filename, buffer }) => folder.file(filename, buffer));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, filename: `${baseFilename}.zip`, contentType: 'application/zip' };
  }
}
