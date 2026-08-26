import { Inject, Injectable } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { PackageStampAnchor } from '@modules/sponsor-package/domain/sponsor-package.enums';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { SELLO_TRANSLATION_PNG_BASE64 } from '../../infrastructure/assets/sello-translation.constant';
import {
  DocumentAssembler,
  DocumentToMerge,
  NamedPdf,
  StampPlacement,
} from './document-assembler.service';

/**
 * Camino **histórico** de armado de paquetes por sponsor: las reglas son estas constantes.
 *
 * Sigue siendo el camino activo mientras `SPONSOR_PACKAGES_FROM_DB` esté apagado, y queda en el
 * repositorio incluso después de prenderlo porque es la referencia contra la que el test comparador
 * verifica que la configuración sembrada produce el mismo plan. Se borra en la entrega 4, cuando la
 * flag lleve tiempo prendida.
 *
 * El procesamiento de archivos (bajar de S3, detectar formato, combinar, estampar) ya no vive acá:
 * lo hace `DocumentAssembler`, compartido con el motor configurable.
 */

export const ASPIRE_SPONSOR_CODE = 'ASPIRE';
export const UNITED_SPONSOR_CODE = 'UNITED';
export const INTRAX_SPONSOR_CODE = 'INTRAX';
export const CENET_SPONSOR_CODE = 'CENET';
export const AAG_SPONSOR_CODE = 'AAG';

/** Los cinco sponsors que hoy tienen paquete en código. Ninguno más está soportado. */
export const SPONSOR_CODES_SOPORTADOS = [
  ASPIRE_SPONSOR_CODE,
  UNITED_SPONSOR_CODE,
  INTRAX_SPONSOR_CODE,
  CENET_SPONSOR_CODE,
  AAG_SPONSOR_CODE,
] as const;

export const ASPIRE_SIGLAS_ORDER = ['PASSPORT', 'JOASPIRE', 'ULETTER', 'TRANSLATION'] as const;
export const TRANSLATION_SIGLAS = 'TRANSLATION';

export const AAG_VACATION_LETTER_SIGLAS = 'VacationLetter';
export const AAG_VACATION_LETTER_FILENAME = 'VacationLetter.pdf';
export const AAG_VACATION_LETTER_S3_FOLDER = 'aag-vacation-letters';
export const AAG_ULETTER_SIGLAS_ORDER = ['ULETTER', 'TRANSLATION'] as const;
export const AAG_PASSPORT_SIGLAS_ORDER = ['PASSPORT'] as const;

export interface UnitedOutputSpec {
  filename: string;
  siglasList: readonly string[];
  /** Si es true, el documento se entrega con su formato original (imagen) en vez de convertirse/combinarse en PDF. */
  asImage?: boolean;
}

export const UNITED_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'PROOF', siglasList: ['UWTPOSS'] },
  { filename: 'ULETTER', siglasList: ['ULETTER', 'TRANSLATION'] },
  { filename: 'PBC', siglasList: ['PBC', 'PBC2'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'JO', siglasList: ['JOUWT'] },
];

export const INTRAX_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'ULETTER', siglasList: ['ULETTER'] },
  { filename: 'TRANSLATION', siglasList: ['TRANSLATION'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'PEF', siglasList: ['PEF'] },
];

export const CENET_OUTPUTS: UnitedOutputSpec[] = [
  { filename: 'ULETTER', siglasList: ['ULETTER', 'TRANSLATION'] },
  { filename: 'PASSPORT', siglasList: ['PASSPORT'] },
  { filename: 'ENGLISH', siglasList: ['CENETENGLISH'] },
  { filename: 'FEE', siglasList: ['CENETFEE'] },
  { filename: 'PHOTO', siglasList: ['PHOTO'], asImage: true },
  { filename: 'JO', siglasList: ['JOCENET'] },
];

/** Geometría del sello del TRANSLATION, tal como se estampa hoy. */
export const SEAL_WIDTH = 120;
export const SEAL_MARGIN_RIGHT = 20;
export const SEAL_MARGIN_BOTTOM = 90;

/** Separadores del nombre base: ASPIRE es un archivo suelto, el resto una carpeta. */
export const ASPIRE_FILENAME_SEPARATOR = '_';
export const FOLDER_NAME_SEPARATOR = ' - ';

export type { NamedPdf } from './document-assembler.service';
export { getErrorMessage } from './document-assembler.service';

export interface VacationLetterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * Centraliza la lógica de armado de documentos por sponsor para que la descarga individual y la
 * descarga masiva compartan el mismo comportamiento.
 */
@Injectable()
export class SponsorDocumentBuilder {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly awsS3Service: AwsS3Service,
    private readonly assembler: DocumentAssembler,
  ) {}

  buildBaseFilename(participant: ParticipantSponsorInfo, separator = ASPIRE_FILENAME_SEPARATOR): string {
    const apellidos = [participant.lastfathername, participant.lastmothername]
      .filter(Boolean)
      .join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');
    return `${participant.dni ?? participant.id}${separator}${apellidos}, ${nombres}`;
  }

  async buildAspirePdf(userId: string): Promise<Buffer | null> {
    const documents = await this.collectDocuments(userId, ASPIRE_SPONSOR_CODE, ASPIRE_SIGLAS_ORDER);
    if (!documents.length) return null;
    const { buffer } = await this.assembler.buildMergedPdf(documents, [this.selloTranslation()]);
    return buffer;
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

    const uletterDocuments = await this.collectDocuments(
      userId,
      AAG_SPONSOR_CODE,
      AAG_ULETTER_SIGLAS_ORDER,
    );
    uletterDocuments.push({ key: AAG_VACATION_LETTER_SIGLAS, bytes: vacationLetter.buffer });
    const uletter = await this.assembler.buildMergedPdf(uletterDocuments);
    outputs.push({ filename: 'ULETTER.pdf', buffer: uletter.buffer });

    const passportDocuments = await this.collectDocuments(
      userId,
      AAG_SPONSOR_CODE,
      AAG_PASSPORT_SIGLAS_ORDER,
    );
    if (passportDocuments.length) {
      const passport = await this.assembler.buildMergedPdf(passportDocuments);
      outputs.push({ filename: 'PASSPORT.pdf', buffer: passport.buffer });
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
        const file = await this.assembler.buildRawFile(documents[0]);
        if (file) outputs.push({ filename: `${output.filename}.${file.extension}`, buffer: file.buffer });
        continue;
      }

      const { buffer } = await this.assembler.buildMergedPdf(documents);
      outputs.push({ filename: `${output.filename}.pdf`, buffer });
    }

    return outputs;
  }

  /** El sello del TRANSLATION con la geometría histórica. */
  private selloTranslation(): StampPlacement {
    return {
      imageBytes: Buffer.from(SELLO_TRANSLATION_PNG_BASE64, 'base64'),
      onlyKey: TRANSLATION_SIGLAS,
      widthPt: SEAL_WIDTH,
      marginXPt: SEAL_MARGIN_RIGHT,
      marginYPt: SEAL_MARGIN_BOTTOM,
      anchor: PackageStampAnchor.BOTTOM_RIGHT,
    };
  }

  private async collectDocuments(
    userId: string,
    sponsorCode: string,
    siglasList: readonly string[],
  ): Promise<DocumentToMerge[]> {
    const documents: DocumentToMerge[] = [];

    // El sponsor lo fija el flujo que arma el paquete (ASPIRE / AAG), no es necesariamente el
    // del participante. Programa y país, en cambio, siempre salen del participante: son las
    // dimensiones que deciden qué documentos le corresponden.
    const context = await this.userDocumentsRepo.findUserApplicabilityContext(userId);

    for (const siglas of siglasList) {
      const target = await this.userDocumentsRepo.findDocumentTargetBySiglasCode(siglas, {
        sponsorCode,
        programId: context?.programId ?? null,
        countryId: context?.countryId ?? null,
      });
      if (!target.found || !target.applicable) continue;

      const history = await this.userDocumentsRepo.findHistoryByUserAndTarget(
        userId,
        target.documentId,
        target.documentSponsorId,
      );
      const lastEntry = history[history.length - 1];
      if (!lastEntry?.url) continue;

      documents.push({ key: siglas, url: lastEntry.url });
    }

    return documents;
  }
}
