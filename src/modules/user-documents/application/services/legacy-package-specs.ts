import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from '@modules/sponsor-package/domain/sponsor-package.enums';

/**
 * Los cinco paquetes de hoy, escritos en el vocabulario de la configuración.
 *
 * Es el puente entre las constantes de `SponsorDocumentBuilder` y las tablas `sponsor_packages`:
 *
 *   - `prisma/seed-sponsor-packages.ts` lo lee para crear las filas.
 *   - `sponsor-package-parity.spec.ts` verifica que esto describe **exactamente** lo que hacen las
 *     constantes, y que el motor configurable produce el mismo plan que el camino histórico.
 *
 * Sin este archivo el seed sería una transcripción a mano de las constantes, y nada garantizaría
 * que la transcripción siga siendo fiel cuando alguien toque una de las dos.
 *
 * Módulo sin dependencias pesadas a propósito: lo importa un script de `prisma/`, y no tiene por
 * qué arrastrar pdf-lib ni jimp para leer una lista.
 */

export interface LegacySourceSpec {
  /** Sigla del documento. El seed la resuelve a `Documents.id`. */
  readonly siglas?: string;
  /** Slug del insumo adjunto, cuando la fuente no es un documento del participante. */
  readonly inputSlug?: string;
  readonly onMissing: PackageOnMissing;
}

export interface LegacyOutputSpec {
  readonly filename: string;
  readonly mode: PackageOutputMode;
  readonly emitWhenEmpty: boolean;
  readonly sources: readonly LegacySourceSpec[];
  /** Sigla del documento sobre cuyas páginas va el sello. Solo ASPIRE tiene uno. */
  readonly stampOnSiglas?: string;
}

export interface LegacyInputSpec {
  readonly slug: string;
  readonly label: string;
  readonly required: boolean;
  readonly mimeType: string;
  readonly maxSizeMb: number;
  readonly archiveToS3: boolean;
  readonly s3Folder: string;
  readonly archiveFilename: string;
}

export interface LegacyPackageSpec {
  readonly sponsorCode: string;
  readonly name: string;
  readonly structure: PackageStructure;
  readonly folderPathTemplate: string;
  readonly itemNameTemplate: string;
  readonly outputs: readonly LegacyOutputSpec[];
  readonly inputs: readonly LegacyInputSpec[];
}

/** Geometría del sello del TRANSLATION, igual a las constantes SEAL_* de hoy. */
export const LEGACY_STAMP_GEOMETRY = {
  widthPt: 120,
  marginXPt: 20,
  marginYPt: 90,
  anchor: PackageStampAnchor.BOTTOM_RIGHT,
} as const;

const OMITIR_FUENTE = PackageOnMissing.OMITIR_FUENTE;

/** Atajo para el caso mayoritario: una fuente que, si falta, simplemente no entra. */
const doc = (siglas: string): LegacySourceSpec => ({ siglas, onMissing: OMITIR_FUENTE });

/** Atajo para los archivos que combinan documentos y desaparecen si no hay ninguno. */
const pdf = (filename: string, siglasList: readonly string[]): LegacyOutputSpec => ({
  filename,
  mode: PackageOutputMode.PDF_COMBINADO,
  emitWhenEmpty: false,
  sources: siglasList.map(doc),
});

export const LEGACY_PACKAGE_SPECS: readonly LegacyPackageSpec[] = [
  {
    sponsorCode: 'ASPIRE',
    name: 'ASPIRE — estándar',
    // Un único PDF por participante, con el nombre de la persona. Sin subcarpeta.
    structure: PackageStructure.ARCHIVO_SUELTO,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni}_{apellidos}, {nombres}',
    outputs: [
      {
        // En ARCHIVO_SUELTO el nombre lo pone el participante: este `filename` no se usa salvo que
        // el paquete llegue a emitir más de un archivo.
        filename: 'ASPIRE',
        mode: PackageOutputMode.PDF_COMBINADO,
        emitWhenEmpty: false,
        sources: ['PASSPORT', 'JOASPIRE', 'ULETTER', 'TRANSLATION'].map(doc),
        stampOnSiglas: 'TRANSLATION',
      },
    ],
    inputs: [],
  },
  {
    sponsorCode: 'UNITED',
    name: 'UNITED — estándar',
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    outputs: [
      pdf('PROOF', ['UWTPOSS']),
      pdf('ULETTER', ['ULETTER', 'TRANSLATION']),
      pdf('PBC', ['PBC', 'PBC2']),
      pdf('PASSPORT', ['PASSPORT']),
      pdf('JO', ['JOUWT']),
    ],
    inputs: [],
  },
  {
    sponsorCode: 'INTRAX',
    name: 'INTRAX — estándar',
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    outputs: [
      pdf('ULETTER', ['ULETTER']),
      pdf('TRANSLATION', ['TRANSLATION']),
      pdf('PASSPORT', ['PASSPORT']),
      pdf('PEF', ['PEF']),
    ],
    inputs: [],
  },
  {
    sponsorCode: 'CENET',
    name: 'CENET — estándar',
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    outputs: [
      pdf('ULETTER', ['ULETTER', 'TRANSLATION']),
      pdf('PASSPORT', ['PASSPORT']),
      pdf('ENGLISH', ['CENETENGLISH']),
      pdf('FEE', ['CENETFEE']),
      {
        // El sponsor pide la foto como imagen, no convertida a PDF.
        filename: 'PHOTO',
        mode: PackageOutputMode.ARCHIVO_ORIGINAL,
        emitWhenEmpty: false,
        sources: [doc('PHOTO')],
      },
      pdf('JO', ['JOCENET']),
    ],
    inputs: [],
  },
  {
    sponsorCode: 'AAG',
    name: 'AAG — estándar',
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    outputs: [
      {
        filename: 'ULETTER',
        mode: PackageOutputMode.PDF_COMBINADO,
        // Hoy este archivo sale SIEMPRE, porque el VacationLetter se agrega antes de combinar
        // aunque el participante no tenga ni ULETTER ni TRANSLATION.
        emitWhenEmpty: true,
        sources: [
          doc('ULETTER'),
          doc('TRANSLATION'),
          // Sin el adjunto no se puede armar el paquete: hoy el participante se omite con motivo.
          { inputSlug: 'vacationLetter', onMissing: PackageOnMissing.OMITIR_PARTICIPANTE },
        ],
      },
      pdf('PASSPORT', ['PASSPORT']),
    ],
    inputs: [
      {
        slug: 'vacationLetter',
        label: 'Vacation Letter',
        required: true,
        mimeType: 'application/pdf',
        maxSizeMb: 10,
        archiveToS3: true,
        s3Folder: 'aag-vacation-letters',
        archiveFilename: 'VacationLetter.pdf',
      },
    ],
  },
];

/** Todas las siglas que el seed tiene que resolver a un `Documents.id`. */
export function collectLegacySiglas(): string[] {
  const siglas = new Set<string>();
  for (const spec of LEGACY_PACKAGE_SPECS) {
    for (const output of spec.outputs) {
      for (const source of output.sources) {
        if (source.siglas) siglas.add(source.siglas);
      }
      if (output.stampOnSiglas) siglas.add(output.stampOnSiglas);
    }
  }
  return [...siglas].sort();
}
