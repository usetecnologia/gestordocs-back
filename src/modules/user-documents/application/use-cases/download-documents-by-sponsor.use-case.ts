import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import JSZip from 'jszip';
import { envs } from '@config/envs';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  AAG_SPONSOR_CODE,
  ASPIRE_SPONSOR_CODE,
  CENET_SPONSOR_CODE,
  FOLDER_NAME_SEPARATOR,
  INTRAX_SPONSOR_CODE,
  NamedPdf,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
  VacationLetterFile,
} from '../services/sponsor-document-builder.service';
import {
  AttachedInput,
  PackageEntry,
  SponsorPackageEngine,
} from '../services/sponsor-package-engine.service';
import { assertAttachedInputsAreValid } from '@modules/sponsor-package/application/use-cases/find-required-inputs.use-case';
import { PackageStructure } from '@modules/sponsor-package/domain/sponsor-package.enums';

export interface DownloadDocumentsBySponsorResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const NO_DOCUMENTS_MESSAGE = 'El participante no tiene documentos subidos para combinar.';

/** Slug histórico del adjunto de AAG. El camino viejo solo entiende este. */
const VACATION_LETTER_SLUG = 'vacationLetter';
const LEGACY_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Extrae el VacationLetter para el camino histórico y reproduce la validación que hacía
 * `ParseOptionalPdfPipe`: con la flag apagada el comportamiento tiene que ser el de siempre, y el
 * pipe ya no puede correr porque lo aceptado ahora depende de la configuración.
 */
function extraerVacationLetterLegacy(
  attached: readonly AttachedInput[],
): VacationLetterFile | undefined {
  const archivo = attached.find((a) => a.slug === VACATION_LETTER_SLUG);
  if (!archivo) return undefined;

  if (archivo.mimetype !== 'application/pdf') {
    throw new BadRequestException('El archivo debe ser un PDF.');
  }
  if (archivo.buffer.length > LEGACY_MAX_SIZE_BYTES) {
    throw new BadRequestException('El tamaño del archivo no debe exceder 10 MB.');
  }

  return {
    buffer: archivo.buffer,
    mimetype: archivo.mimetype,
    originalname: archivo.originalname,
  };
}

@Injectable()
export class DownloadDocumentsBySponsorUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly sponsorDocumentBuilder: SponsorDocumentBuilder,
    private readonly engine: SponsorPackageEngine,
  ) {}

  execute(
    userId: string,
    attached: readonly AttachedInput[] = [],
  ): Promise<DownloadDocumentsBySponsorResult> {
    return envs.SPONSOR_PACKAGES_FROM_DB
      ? this.executeFromConfig(userId, attached)
      : this.executeLegacy(userId, extraerVacationLetterLegacy(attached));
  }

  // ---------------------------------------------------------------------------
  // Camino configurable
  // ---------------------------------------------------------------------------

  private async executeFromConfig(
    userId: string,
    attached: readonly AttachedInput[],
  ): Promise<DownloadDocumentsBySponsorResult> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(userId);
    if (!participant) throw new NotFoundException(`Participante #${userId} no encontrado.`);

    const catalog = await this.engine.loadCatalog([participant.sponsorCode]);

    // A diferencia de la masiva, acá NO se exige proceso abierto: la descarga individual siempre
    // pudo bajar el expediente visible, y cambiarlo ahora sería un cambio de comportamiento que no
    // pidió nadie. El proceso, si existe, solo aporta programa y país para resolver el alcance.
    const proceso = await this.userDocumentsRepo.findProcesoAbiertoByUserId(userId);

    const paquete = catalog.resolve(participant.sponsorCode, {
      programId: proceso?.programId ?? null,
      countryId: proceso?.countryId ?? null,
    });
    if (!paquete) {
      throw new BadRequestException(
        'El sponsor del participante no tiene un paquete de descarga configurado.',
      );
    }

    // El tipo y el tamaño aceptados los define cada adjunto en la configuración, así que se validan
    // acá y no en un pipe: recién con el paquete resuelto se sabe qué pide.
    assertAttachedInputsAreValid(paquete.inputs, attached);

    const adjuntados = new Set(attached.map((a) => a.slug));
    const faltante = paquete.inputs.find((input) => input.required && !adjuntados.has(input.slug));
    if (faltante) {
      throw new BadRequestException(
        `El archivo "${faltante.label}" es obligatorio para participantes del sponsor ${paquete.sponsorCode}.`,
      );
    }

    await this.engine.archiveInputs(catalog, attached);

    const { entries, skipReason } = await this.engine.buildForParticipant({
      userId,
      participant,
      proceso,
      paquete,
      attached,
    });
    if (skipReason) throw new NotFoundException(skipReason);

    // Un paquete de archivo suelto se entrega tal cual; uno de carpeta se entrega comprimido, que
    // es exactamente lo que hacen hoy ASPIRE y el resto.
    if (paquete.structure === PackageStructure.ARCHIVO_SUELTO && entries.length === 1) {
      return {
        buffer: entries[0].buffer,
        filename: entries[0].path,
        contentType: 'application/pdf',
      };
    }

    return this.zipEntries(this.engine.buildItemName(paquete, participant, proceso), entries);
  }

  private async zipEntries(
    baseFilename: string,
    entries: readonly PackageEntry[],
  ): Promise<DownloadDocumentsBySponsorResult> {
    const zip = new JSZip();
    // Las rutas que devuelve el motor ya vienen con la carpeta del participante adelante, así que
    // se escriben tal cual — no se vuelve a anidar.
    entries.forEach(({ path, buffer }) => zip.file(path, buffer));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, filename: `${baseFilename}.zip`, contentType: 'application/zip' };
  }

  // ---------------------------------------------------------------------------
  // Camino histórico. Se borra en la entrega 4.
  // ---------------------------------------------------------------------------

  private async executeLegacy(
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
        `${INTRAX_SPONSOR_CODE}, ${CENET_SPONSOR_CODE} o ${AAG_SPONSOR_CODE}).`,
    );
  }

  private async buildZipResult(
    participant: ParticipantSponsorInfo,
    outputs: NamedPdf[],
  ): Promise<DownloadDocumentsBySponsorResult> {
    const baseFilename = this.sponsorDocumentBuilder.buildBaseFilename(
      participant,
      FOLDER_NAME_SEPARATOR,
    );
    const zip = new JSZip();
    const folder = zip.folder(baseFilename)!;
    outputs.forEach(({ filename, buffer }) => folder.file(filename, buffer));

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, filename: `${baseFilename}.zip`, contentType: 'application/zip' };
  }
}
