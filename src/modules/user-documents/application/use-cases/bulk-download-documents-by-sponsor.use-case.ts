import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  getErrorMessage,
  INTRAX_SPONSOR_CODE,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
  VacationLetterFile,
} from '../services/sponsor-document-builder.service';

const ZIP_FILENAME = 'documentos_sponsor';

const SIN_PROGRAMA = 'SIN PROGRAMA';
const SIN_PAIS = 'SIN PAIS';

/**
 * Deja el texto usable como nombre de carpeta dentro del ZIP.
 *
 * `/` y `\` son separadores de ruta: un programa llamado "WAT/USA" partiría la carpeta en dos
 * niveles sin que nadie lo pidiera. El resto de caracteres que Windows rechaza al extraer se
 * cambian también, porque un ZIP que no se puede descomprimir no le sirve a nadie.
 */
function toFolderSegment(value: string | null, fallback: string): string {
  const limpio = (value ?? '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return limpio || fallback;
}

const NOT_FOUND_REASON = 'DNI no encontrado.';
const NO_PROCESO_ABIERTO_REASON =
  'El participante no tiene un proceso en curso: solo se descargan los documentos del proceso activo.';
const NO_DOCUMENTS_REASON = 'El participante no tiene documentos subidos para combinar.';
const UNSUPPORTED_SPONSOR_REASON = `El participante no pertenece a un sponsor soportado (${ASPIRE_SPONSOR_CODE}, ${UNITED_SPONSOR_CODE}, ${INTRAX_SPONSOR_CODE}, ${CENET_SPONSOR_CODE} o ${AAG_SPONSOR_CODE}).`;
const AAG_MISSING_VACATION_LETTER_REASON =
  'El sponsor AAG requiere adjuntar el PDF de VacationLetter en la descarga masiva.';
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

  async execute(
    dnis: string[],
    vacationLetter?: VacationLetterFile,
  ): Promise<BulkDownloadDocumentsBySponsorResult> {
    const zip = new JSZip();
    // Las carpetas ya no se crean por adelantado: el ZIP se agrupa por programa y país, y esos
    // valores salen de cada participante. Se crean solas al escribir el primer archivo dentro
    // —JSZip arma los niveles intermedios de la ruta—, así que ninguna queda vacía.
    const skipped: BulkDownloadSkippedEntry[] = [];
    let hasAnyFile = false;
    let vacationLetterUploaded = false;

    for (const dni of dnis) {
      try {
        const participant = await this.userDocumentsRepo.findParticipantInfoByDni(dni);

        if (!participant) {
          skipped.push({ dni, fullName: null, reason: NOT_FOUND_REASON });
          continue;
        }

        const fullName = this.buildFullName(participant);

        // Un ciclo finalizado está congelado y su expediente no entra en la descarga masiva: si el
        // participante no tiene un proceso abierto, se omite antes de armar nada.
        //
        // Sin esto el paquete se armaba igual, porque el expediente se resuelve por
        // `User.procesoVisibleId` y ese puntero queda apuntando al proceso FINALIZADO cuando se
        // cierra — ver `ProcesoPrismaRepository.finalizar`.
        const procesoAbierto = await this.userDocumentsRepo.findProcesoAbiertoByUserId(participant.id);
        if (!procesoAbierto) {
          skipped.push({ dni, fullName, reason: NO_PROCESO_ABIERTO_REASON });
          continue;
        }

        // Prefijo programa/país del ciclo. El sponsor se agrega dentro de cada rama, porque el
        // paquete ASPIRE es un archivo suelto y los demás son una subcarpeta por participante.
        const grupo =
          `${toFolderSegment(procesoAbierto.programName, SIN_PROGRAMA)}/` +
          `${toFolderSegment(procesoAbierto.countryName, SIN_PAIS)}`;

        if (participant.sponsorCode === ASPIRE_SPONSOR_CODE) {
          const buffer = await this.sponsorDocumentBuilder.buildAspirePdf(participant.id);
          if (!buffer) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant);
          zip.file(`${grupo}/${ASPIRE_SPONSOR_CODE}/${baseFilename}.pdf`, buffer);
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
          const destino = `${grupo}/${UNITED_SPONSOR_CODE}/${baseFilename}`;
          outputs.forEach(({ filename, buffer }) => zip.file(`${destino}/${filename}`, buffer));
          hasAnyFile = true;
          continue;
        }

        if (participant.sponsorCode === INTRAX_SPONSOR_CODE) {
          const outputs = await this.sponsorDocumentBuilder.buildIntraxOutputs(participant.id);
          if (!outputs.length) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
          const destino = `${grupo}/${INTRAX_SPONSOR_CODE}/${baseFilename}`;
          outputs.forEach(({ filename, buffer }) => zip.file(`${destino}/${filename}`, buffer));
          hasAnyFile = true;
          continue;
        }

        if (participant.sponsorCode === CENET_SPONSOR_CODE) {
          const outputs = await this.sponsorDocumentBuilder.buildCenetOutputs(participant.id);
          if (!outputs.length) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
          const destino = `${grupo}/${CENET_SPONSOR_CODE}/${baseFilename}`;
          outputs.forEach(({ filename, buffer }) => zip.file(`${destino}/${filename}`, buffer));
          hasAnyFile = true;
          continue;
        }

        if (participant.sponsorCode === AAG_SPONSOR_CODE) {
          if (!vacationLetter) {
            skipped.push({ dni, fullName, reason: AAG_MISSING_VACATION_LETTER_REASON });
            continue;
          }

          if (!vacationLetterUploaded) {
            await this.sponsorDocumentBuilder.uploadVacationLetterRecord(vacationLetter);
            vacationLetterUploaded = true;
          }

          const outputs = await this.sponsorDocumentBuilder.buildAagOutputs(participant.id, vacationLetter);
          if (!outputs.length) {
            skipped.push({ dni, fullName, reason: NO_DOCUMENTS_REASON });
            continue;
          }

          const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(participant, ' - ');
          const destino = `${grupo}/${AAG_SPONSOR_CODE}/${baseFilename}`;
          outputs.forEach(({ filename, buffer }) => zip.file(`${destino}/${filename}`, buffer));
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
