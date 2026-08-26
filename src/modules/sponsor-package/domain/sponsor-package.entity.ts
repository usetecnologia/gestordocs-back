import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from './sponsor-package.enums';

/**
 * El sello que se estampa sobre las páginas de un archivo de salida.
 *
 * `onlyDocumentId` reproduce lo que hoy hace `applySeal` en `SponsorDocumentBuilder`: el sello va
 * solo sobre las páginas que aportó un documento concreto (el TRANSLATION), no sobre todo el PDF.
 */
export interface SponsorPackageStamp {
  readonly id: string;
  readonly assetUrl: string;
  /** null = el sello va sobre todas las páginas del archivo. */
  readonly onlyDocumentId: string | null;
  readonly widthPt: number;
  readonly marginXPt: number;
  readonly marginYPt: number;
  readonly anchor: PackageStampAnchor;
}

/**
 * Un documento del participante —o un insumo adjunto en la descarga— que entra a un archivo.
 *
 * Exactamente uno de `documentId` / `inputId` está presente. `documentSiglasCode` y `documentName`
 * son informativos: sirven para los logs y para el árbol que devuelve el preview, nunca para
 * resolver el documento (eso lo hace `documentId`).
 */
export interface SponsorPackageSource {
  readonly id: string;
  readonly documentId: string | null;
  readonly inputId: string | null;
  readonly documentSiglasCode: string | null;
  readonly documentName: string | null;
  readonly inputSlug: string | null;
  readonly order: number;
  readonly onMissing: PackageOnMissing;
}

/** Un archivo dentro del paquete: ULETTER.pdf, PASSPORT.pdf, PHOTO.jpg… */
export interface SponsorPackageOutput {
  readonly id: string;
  /** Sin extensión: la pone el modo (`.pdf`) o el formato real del archivo original. */
  readonly filename: string;
  readonly mode: PackageOutputMode;
  readonly order: number;
  /**
   * Emite el archivo aunque ninguna fuente haya aportado páginas. Replica el `ULETTER.pdf` de AAG,
   * que hoy sale siempre porque el VacationLetter se agrega antes de combinar.
   */
  readonly emitWhenEmpty: boolean;
  readonly sources: readonly SponsorPackageSource[];
  readonly stamps: readonly SponsorPackageStamp[];
}

/** Un archivo que el staff adjunta al momento de descargar y se reutiliza para todo el lote. */
export interface SponsorPackageInput {
  readonly id: string;
  /** Nombre del campo en el multipart. Hoy: "vacationLetter". */
  readonly slug: string;
  readonly label: string;
  readonly required: boolean;
  readonly mimeType: string;
  readonly maxSizeMb: number;
  readonly archiveToS3: boolean;
  readonly s3Folder: string | null;
  readonly archiveFilename: string | null;
}

/**
 * La regla de armado completa, con su árbol resuelto. Es lo que el motor interpreta.
 *
 * `programId` / `countryId` en null significan "aplica a todos": es el alcance genérico, el único
 * que se usa mientras el formulario del admin no exponga los selectores.
 */
export interface SponsorPackage {
  readonly id: string;
  readonly name: string;
  readonly sponsorId: string;
  readonly sponsorCode: string;
  readonly programId: string | null;
  readonly countryId: string | null;
  readonly structure: PackageStructure;
  readonly folderPathTemplate: string;
  readonly itemNameTemplate: string;
  readonly fallbackPrograma: string;
  readonly fallbackPais: string;
  readonly priority: number;
  readonly createdAt: Date;
  readonly outputs: readonly SponsorPackageOutput[];
  readonly inputs: readonly SponsorPackageInput[];
}
