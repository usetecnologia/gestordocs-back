import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  ASPIRE_SPONSOR_CODE,
  getErrorMessage,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
} from '../services/sponsor-document-builder.service';

const ZIP_FILENAME = 'documentos_sponsor';

const NOT_FOUND_REASON = 'DNI no encontrado.';
const NO_DOCUMENTS_REASON = 'El participante no tiene documentos subidos para combinar.';
const UNSUPPORTED_SPONSOR_REASON = `El participante no pertenece a un sponsor soportado (${ASPIRE_SPONSOR_CODE} o ${UNITED_SPONSOR_CODE}).`;
const PROCESSING_ERROR_REASON = 'Ocurrió un error al procesar los documentos del participante.';

export interface BulkDownloadSkippedEntry {
  dni: string;
  fullName: string | null;
  reason: string;
}

export interface BulkDownloadDocumentsBySponsorResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  skipped: BulkDownloadSkippedEntry[];
}

@Injectable()
export class BulkDownloadDocumentsBySponsorUseCase {
  private readonly logger = new Logger(BulkDownloadDocumentsBySponsorUseCase.name);

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly sponsorDocumentBuilder: SponsorDocumentBuilder,
  ) {}

  async execute(dnis: string[]): Promise<BulkDownloadDocumentsBySponsorResult> {
    const zip = new JSZip();
    const aspireFolder = zip.folder(ASPIRE_SPONSOR_CODE)!;
    const unitedFolder = zip.folder(UNITED_SPONSOR_CODE)!;
    const skipped: BulkDownloadSkippedEntry[] = [];
    let hasAnyFile = false;

    for (const dni of dnis) {
      try {
        const participant = await this.userDocumentsRepo.findParticipantInfoByDni(dni);

        if (!participant) {
          skipped.push({ dni, fullName: null, reason: NOT_FOUND_REASON });
          continue;
        }

        const fullName = this.buildFullName(participant);

        if (participant.sponsorCode === ASPIRE_SPONSOR_CODE) {
          const buffer = await this.sponsorDocumentBuilder.buildAspirePdf(participant.id);
          if (!buffer) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant);
          aspireFolder.file(`${baseFilename}.pdf`, buffer);
          hasAnyFile = true;
          continue;
        }

        if (participant.sponsorCode === UNITED_SPONSOR_CODE) {
          const outputs = await this.sponsorDocumentBuilder.buildUnitedOutputs(participant.id);
          if (!outputs.length) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
          const participantFolder = unitedFolder.folder(baseFilename)!;
          outputs.forEach(({ filename, buffer }) => participantFolder.file(filename, buffer));
          hasAnyFile = true;
          continue;
        }

        skipped.push({ dni, fullName, reason: UNSUPPORTED_SPONSOR_REASON });
      } catch (error) {
        // Un participante con datos inesperados no debe tumbar la descarga masiva de los demás.
        this.logger.warn(`Error procesando DNI "${dni}": ${getErrorMessage(error)}`);
        skipped.push({ dni, fullName: null, reason: PROCESSING_ERROR_REASON });
      }
    }

    if (!hasAnyFile) {
      throw new NotFoundException('Ningún participante tiene documentos disponibles para descargar.');
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, filename: `${ZIP_FILENAME}.zip`, contentType: 'application/zip', skipped };
  }

  private buildFullName(participant: ParticipantSponsorInfo): string {
    const apellidos = [participant.lastfathername, participant.lastmothername].filter(Boolean).join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');
    return `${apellidos}, ${nombres}`;
  }
}
