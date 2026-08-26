import { SponsorDocumentBuilder } from './sponsor-document-builder.service';
import {
  ASPIRE_SIGLAS_ORDER,
  AAG_ULETTER_SIGLAS_ORDER,
  AAG_PASSPORT_SIGLAS_ORDER,
  CENET_OUTPUTS,
  INTRAX_OUTPUTS,
  SEAL_MARGIN_BOTTOM,
  SEAL_MARGIN_RIGHT,
  SEAL_WIDTH,
  UNITED_OUTPUTS,
  UnitedOutputSpec,
} from './sponsor-document-builder.service';
import { SponsorPackageEngine } from './sponsor-package-engine.service';
import { SponsorPackagePlanner } from '@modules/sponsor-package/application/services/sponsor-package-planner.service';
import {
  DocumentAssembler,
  DocumentToMerge,
  StampPlacement,
} from './document-assembler.service';
import {
  LEGACY_PACKAGE_SPECS,
  LEGACY_STAMP_GEOMETRY,
  LegacyPackageSpec,
} from './legacy-package-specs';
import type { AwsS3Service } from '@shared/aws/aws-s3.service';
import type {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  ProcesoAbiertoInfo,
} from '../../domain/user-documents.repository';
import type { ISponsorPackageRepository } from '@modules/sponsor-package/domain/sponsor-package.repository';
import type { SponsorPackage } from '@modules/sponsor-package/domain/sponsor-package.entity';
import {
  PackageOutputMode,
  PackageStructure,
} from '@modules/sponsor-package/domain/sponsor-package.enums';

/**
 * Red de seguridad de la entrega 1: **el camino configurable tiene que armar exactamente el mismo
 * árbol que el camino histórico**. Si estos tests no pasan, `SPONSOR_PACKAGES_FROM_DB` no se prende.
 *
 * Son dos verificaciones distintas:
 *
 *   1. Fidelidad del puente — `LEGACY_PACKAGE_SPECS` describe lo que dicen las constantes. Detecta
 *      que alguien toque `UNITED_OUTPUTS` y se olvide del spec (o al revés), que es exactamente el
 *      modo en que una migración así se rompe en silencio.
 *   2. Paridad del motor — con los mismos datos de participante, el motor configurable produce los
 *      mismos archivos, con las mismas fuentes en el mismo orden, que `SponsorDocumentBuilder`.
 *
 * El ensamblado real (pdf-lib, jimp, S3) se sustituye por un doble que registra qué se le pidió
 * combinar. No hace falta generar PDFs de verdad para comparar planes, y además los dos caminos ya
 * comparten `DocumentAssembler`: si esa parte fuera distinta, no habría nada que comparar.
 */

const USER_ID = 'user-1';

/** Todas las siglas que aparecen en los cinco paquetes, con un id de documento estable por sigla. */
const SIGLAS = [
  'PASSPORT',
  'JOASPIRE',
  'ULETTER',
  'TRANSLATION',
  'UWTPOSS',
  'PBC',
  'PBC2',
  'JOUWT',
  'PEF',
  'CENETENGLISH',
  'CENETFEE',
  'PHOTO',
  'JOCENET',
] as const;

const idBySiglas = new Map<string, string>(SIGLAS.map((s) => [s, `doc-${s}`]));
const siglasById = new Map<string, string>([...idBySiglas].map(([s, id]) => [id, s]));

const participant: ParticipantSponsorInfo = {
  id: USER_ID,
  dni: '71234567',
  firstname: 'MARIA',
  middlename: 'LUCIA',
  lastfathername: 'PEREZ',
  lastmothername: 'QUISPE',
  sponsorCode: null,
};

const proceso: ProcesoAbiertoInfo = {
  id: 'proceso-1',
  programId: 'prog-1',
  countryId: 'pais-1',
  programName: 'WAT USA',
  countryName: 'PERU',
};

/**
 * Repositorio de prueba en el que **todos** los documentos aplican y todos tienen archivo. Es el
 * escenario en el que los dos caminos deben coincidir archivo por archivo; los casos de documentos
 * faltantes se cubren aparte, más abajo.
 */
function repoConTodo(disponibles: ReadonlySet<string> = new Set(SIGLAS)): IUserDocumentsRepository {
  return {
    findUserApplicabilityContext: () =>
      Promise.resolve({ sponsorCode: null, programId: 'prog-1', countryId: 'pais-1' }),

    findDocumentTargetBySiglasCode: (siglas: string) => {
      const id = idBySiglas.get(siglas);
      if (!id) return Promise.resolve({ found: false as const });
      return Promise.resolve({
        found: true as const,
        applicable: true as const,
        documentId: id,
        documentSponsorId: null,
      });
    },

    findDocumentTargetById: (documentId: string) => {
      if (!siglasById.has(documentId)) return Promise.resolve({ found: false as const });
      return Promise.resolve({
        found: true as const,
        applicable: true as const,
        documentId,
        documentSponsorId: null,
      });
    },

    findHistoryByUserAndTarget: (_userId: string, documentId: string | null) => {
      const siglas = documentId ? siglasById.get(documentId) : null;
      if (!siglas || !disponibles.has(siglas)) return Promise.resolve([]);
      return Promise.resolve([
        { status: 'REVISADO', url: `https://bucket/${siglas}.pdf`, createdAt: new Date(0) },
      ]);
    },
  } as unknown as IUserDocumentsRepository;
}

/** Lo que un archivo terminó combinando: las siglas, en orden, y sobre cuál se estampó el sello. */
interface ArchivoPlan {
  name: string;
  sources: string[];
  stampOn: string | null;
  stampGeometry: { widthPt: number; marginXPt: number; marginYPt: number } | null;
}

/**
 * Doble de `DocumentAssembler` que no arma PDFs: codifica en el buffer las claves que le pidieron
 * combinar y recuerda los sellos, para poder comparar planes.
 */
function assemblerDoble(): DocumentAssembler {
  const encode = (documents: readonly DocumentToMerge[], stamps: readonly StampPlacement[]) =>
    Buffer.from(
      JSON.stringify({
        sources: documents.map((d) => d.key),
        stamps: stamps.map((s) => ({
          onlyKey: s.onlyKey,
          widthPt: s.widthPt,
          marginXPt: s.marginXPt,
          marginYPt: s.marginYPt,
        })),
      }),
    );

  return {
    buildMergedPdf: (documents: readonly DocumentToMerge[], stamps: readonly StampPlacement[] = []) =>
      Promise.resolve({ buffer: encode(documents, stamps), pageCount: documents.length }),

    buildRawFile: (document: DocumentToMerge) =>
      Promise.resolve({ buffer: encode([document], []), extension: 'jpg' }),

    downloadStampAsset: () => Promise.resolve(Buffer.from('sello')),
  } as unknown as DocumentAssembler;
}

/** Traduce el buffer del doble a un plan legible, normalizando ids de documento a siglas. */
function decodePlan(name: string, buffer: Buffer): ArchivoPlan {
  const raw = JSON.parse(buffer.toString()) as {
    sources: string[];
    stamps: { onlyKey: string | null; widthPt: number; marginXPt: number; marginYPt: number }[];
  };

  const normalize = (key: string): string =>
    key.startsWith('input:') ? key : (siglasById.get(key) ?? key);

  const stamp = raw.stamps[0] ?? null;

  return {
    name,
    sources: raw.sources.map(normalize),
    stampOn: stamp ? (stamp.onlyKey ? normalize(stamp.onlyKey) : '*') : null,
    stampGeometry: stamp
      ? { widthPt: stamp.widthPt, marginXPt: stamp.marginXPt, marginYPt: stamp.marginYPt }
      : null,
  };
}

/** Arma el objeto de dominio que el seed dejaría en base para un spec dado. */
function specToPackage(spec: LegacyPackageSpec): SponsorPackage {
  const inputIdBySlug = new Map(spec.inputs.map((i) => [i.slug, `input-${i.slug}`]));

  return {
    id: `pkg-${spec.sponsorCode}`,
    name: spec.name,
    sponsorId: `sponsor-${spec.sponsorCode}`,
    sponsorCode: spec.sponsorCode,
    programId: null,
    countryId: null,
    structure: spec.structure,
    folderPathTemplate: spec.folderPathTemplate,
    itemNameTemplate: spec.itemNameTemplate,
    fallbackPrograma: 'SIN PROGRAMA',
    fallbackPais: 'SIN PAIS',
    priority: 0,
    createdAt: new Date(0),
    inputs: spec.inputs.map((i) => ({ ...i, id: inputIdBySlug.get(i.slug)! })),
    outputs: spec.outputs.map((output, index) => ({
      id: `out-${spec.sponsorCode}-${output.filename}`,
      filename: output.filename,
      mode: output.mode,
      order: index,
      emitWhenEmpty: output.emitWhenEmpty,
      sources: output.sources.map((source, orden) => ({
        id: `src-${spec.sponsorCode}-${output.filename}-${orden}`,
        documentId: source.siglas ? idBySiglas.get(source.siglas)! : null,
        inputId: source.inputSlug ? inputIdBySlug.get(source.inputSlug)! : null,
        documentSiglasCode: source.siglas ?? null,
        documentName: source.siglas ?? null,
        inputSlug: source.inputSlug ?? null,
        order: orden,
        onMissing: source.onMissing,
      })),
      stamps: output.stampOnSiglas
        ? [
            {
              id: `stamp-${spec.sponsorCode}`,
              assetUrl: 'https://bucket/sello.png',
              onlyDocumentId: idBySiglas.get(output.stampOnSiglas)!,
              ...LEGACY_STAMP_GEOMETRY,
            },
          ]
        : [],
    })),
  };
}

function nuevoBuilder(repo: IUserDocumentsRepository): SponsorDocumentBuilder {
  return new SponsorDocumentBuilder(repo, {} as AwsS3Service, assemblerDoble());
}

function nuevoEngine(repo: IUserDocumentsRepository): SponsorPackageEngine {
  // El planificador es real: es justamente lo que se quiere ejercitar. Lo único sustituido es el
  // ensamblado, que no hace falta para comparar planes.
  return new SponsorPackageEngine(
    {} as ISponsorPackageRepository,
    new SponsorPackagePlanner(repo),
    assemblerDoble(),
    {} as AwsS3Service,
  );
}

const specPorSponsor = new Map(LEGACY_PACKAGE_SPECS.map((s) => [s.sponsorCode, s]));

const VACATION_LETTER = {
  slug: 'vacationLetter',
  buffer: Buffer.from('%PDF-vacation'),
  mimetype: 'application/pdf',
  originalname: 'vl.pdf',
};

/** Corre el motor configurable y devuelve el plan de cada archivo, sin la carpeta del participante. */
async function planConfigurable(
  sponsorCode: string,
  repo: IUserDocumentsRepository,
  attached: (typeof VACATION_LETTER)[] = [],
): Promise<{ planes: ArchivoPlan[]; skipReason: string | null }> {
  const paquete = specToPackage(specPorSponsor.get(sponsorCode)!);
  const engine = nuevoEngine(repo);

  const { entries, skipReason } = await engine.buildForParticipant({
    userId: USER_ID,
    participant: { ...participant, sponsorCode },
    proceso,
    paquete,
    attached,
  });

  const itemName = engine.buildItemName(paquete, { ...participant, sponsorCode }, proceso);
  const planes = entries.map((entry) => {
    const relativo =
      paquete.structure === PackageStructure.ARCHIVO_SUELTO
        ? entry.path
        : entry.path.slice(`${itemName}/`.length);
    return decodePlan(relativo, entry.buffer);
  });

  return { planes, skipReason };
}

// ---------------------------------------------------------------------------
// 1. Fidelidad del puente: el spec describe lo que dicen las constantes
// ---------------------------------------------------------------------------

describe('LEGACY_PACKAGE_SPECS describe las constantes de SponsorDocumentBuilder', () => {
  /** Traduce un spec de output al formato de las constantes, para compararlos de igual a igual. */
  function specsComoConstantes(sponsorCode: string): UnitedOutputSpec[] {
    return specPorSponsor.get(sponsorCode)!.outputs.map((output) => ({
      filename: output.filename,
      siglasList: output.sources.map((s) => s.siglas!).filter(Boolean),
      ...(output.mode === PackageOutputMode.ARCHIVO_ORIGINAL ? { asImage: true } : {}),
    }));
  }

  it.each([
    ['UNITED', UNITED_OUTPUTS],
    ['INTRAX', INTRAX_OUTPUTS],
    ['CENET', CENET_OUTPUTS],
  ])('%s: los archivos y sus siglas coinciden', (sponsorCode, constantes) => {
    const delSpec = specsComoConstantes(sponsorCode);

    expect(delSpec.map((o) => o.filename)).toEqual(constantes.map((o) => o.filename));
    delSpec.forEach((output, i) => {
      expect(output.siglasList).toEqual([...constantes[i].siglasList]);
      expect(output.asImage ?? false).toBe(constantes[i].asImage ?? false);
    });
  });

  it('ASPIRE: un solo archivo, con las cuatro siglas en el orden de ASPIRE_SIGLAS_ORDER', () => {
    const outputs = specPorSponsor.get('ASPIRE')!.outputs;
    expect(outputs).toHaveLength(1);
    expect(outputs[0].sources.map((s) => s.siglas)).toEqual([...ASPIRE_SIGLAS_ORDER]);
    expect(outputs[0].stampOnSiglas).toBe('TRANSLATION');
  });

  it('AAG: ULETTER combina ULETTER + TRANSLATION + el adjunto, y PASSPORT va aparte', () => {
    const outputs = specPorSponsor.get('AAG')!.outputs;
    const uletter = outputs.find((o) => o.filename === 'ULETTER')!;
    const passport = outputs.find((o) => o.filename === 'PASSPORT')!;

    // El adjunto va al final, igual que el `push` del VacationLetter después de collectDocuments.
    expect(uletter.sources.map((s) => s.siglas ?? `adjunto:${s.inputSlug}`)).toEqual([
      ...AAG_ULETTER_SIGLAS_ORDER,
      'adjunto:vacationLetter',
    ]);
    // Hoy este archivo sale siempre, tenga o no documentos el participante.
    expect(uletter.emitWhenEmpty).toBe(true);

    expect(passport.sources.map((s) => s.siglas)).toEqual([...AAG_PASSPORT_SIGLAS_ORDER]);
    expect(passport.emitWhenEmpty).toBe(false);
  });

  it('la geometría del sello es la misma que las constantes SEAL_*', () => {
    expect(LEGACY_STAMP_GEOMETRY.widthPt).toBe(SEAL_WIDTH);
    expect(LEGACY_STAMP_GEOMETRY.marginXPt).toBe(SEAL_MARGIN_RIGHT);
    expect(LEGACY_STAMP_GEOMETRY.marginYPt).toBe(SEAL_MARGIN_BOTTOM);
  });

  it('cubre exactamente los cinco sponsors soportados', () => {
    expect([...specPorSponsor.keys()].sort()).toEqual([
      'AAG',
      'ASPIRE',
      'CENET',
      'INTRAX',
      'UNITED',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. Paridad del motor: los dos caminos producen el mismo árbol
// ---------------------------------------------------------------------------

describe('paridad entre el camino histórico y el configurable', () => {
  it.each(['UNITED', 'INTRAX', 'CENET'])(
    '%s: mismos archivos, mismas fuentes, mismo orden',
    async (sponsorCode) => {
      const repo = repoConTodo();
      const builder = nuevoBuilder(repo);

      const metodo = {
        UNITED: () => builder.buildUnitedOutputs(USER_ID),
        INTRAX: () => builder.buildIntraxOutputs(USER_ID),
        CENET: () => builder.buildCenetOutputs(USER_ID),
      }[sponsorCode]!;

      const legacy = (await metodo()).map((o) => decodePlan(o.filename, o.buffer));
      const { planes } = await planConfigurable(sponsorCode, repo);

      expect(planes).toEqual(legacy);
    },
  );

  it('ASPIRE: un PDF con las cuatro siglas y el sello sobre el TRANSLATION', async () => {
    const repo = repoConTodo();
    const buffer = await nuevoBuilder(repo).buildAspirePdf(USER_ID);
    const legacy = decodePlan('ASPIRE', buffer!);

    const { planes } = await planConfigurable('ASPIRE', repo);

    expect(planes).toHaveLength(1);
    expect(planes[0].sources).toEqual(legacy.sources);
    expect(planes[0].stampOn).toEqual(legacy.stampOn);
    expect(planes[0].stampGeometry).toEqual(legacy.stampGeometry);
    // En ARCHIVO_SUELTO el archivo lleva el nombre del participante, no el del output.
    expect(planes[0].name).toBe('71234567_PEREZ QUISPE, MARIA LUCIA.pdf');
  });

  it('AAG: mismos archivos y el adjunto al final del ULETTER', async () => {
    const repo = repoConTodo();
    const legacy = (
      await nuevoBuilder(repo).buildAagOutputs(USER_ID, {
        buffer: VACATION_LETTER.buffer,
        mimetype: VACATION_LETTER.mimetype,
        originalname: VACATION_LETTER.originalname,
      })
    ).map((o) => decodePlan(o.filename, o.buffer));

    const { planes } = await planConfigurable('AAG', repo, [VACATION_LETTER]);

    expect(planes.map((p) => p.name)).toEqual(legacy.map((p) => p.name));
    // El camino histórico llama a la fuente "VacationLetter" y el configurable "input:vacationLetter":
    // es la misma fuente, identificada de dos maneras. El resto tiene que ser idéntico.
    expect(planes[0].sources.slice(0, 2)).toEqual(legacy[0].sources.slice(0, 2));
    expect(planes[0].sources[2]).toBe('input:vacationLetter');
    expect(planes[1]).toEqual(legacy[1]);
  });

  it('CENET entrega el PHOTO en su formato original, no como PDF', async () => {
    const { planes } = await planConfigurable('CENET', repoConTodo());
    expect(planes.map((p) => p.name)).toContain('PHOTO.jpg');
  });

  it('la carpeta de agrupación es {PROGRAMA}/{PAIS}/{SPONSOR}', () => {
    const paquete = specToPackage(specPorSponsor.get('UNITED')!);
    const engine = nuevoEngine(repoConTodo());

    expect(engine.buildGroupPath(paquete, { ...participant, sponsorCode: 'UNITED' }, proceso)).toBe(
      'WAT USA/PERU/UNITED',
    );
  });

  it('sin programa ni país en el ciclo, la carpeta cae en SIN PROGRAMA / SIN PAIS', () => {
    const paquete = specToPackage(specPorSponsor.get('UNITED')!);
    const engine = nuevoEngine(repoConTodo());
    const sinDatos = { ...proceso, programName: null, countryName: null };

    expect(engine.buildGroupPath(paquete, { ...participant, sponsorCode: 'UNITED' }, sinDatos)).toBe(
      'SIN PROGRAMA/SIN PAIS/UNITED',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Documentos faltantes: la política onMissing reproduce el comportamiento de hoy
// ---------------------------------------------------------------------------

describe('documentos faltantes', () => {
  it('un archivo sin ninguna fuente disponible no se genera, y el resto sí', async () => {
    // El participante no tiene UWTPOSS ni JOUWT: hoy PROOF.pdf y JO.pdf simplemente no salen.
    const repo = repoConTodo(new Set(['ULETTER', 'TRANSLATION', 'PBC', 'PBC2', 'PASSPORT']));

    const legacy = (await nuevoBuilder(repo).buildUnitedOutputs(USER_ID)).map((o) =>
      decodePlan(o.filename, o.buffer),
    );
    const { planes } = await planConfigurable('UNITED', repo);

    expect(planes.map((p) => p.name)).toEqual(['ULETTER.pdf', 'PBC.pdf', 'PASSPORT.pdf']);
    expect(planes).toEqual(legacy);
  });

  it('una fuente faltante se cae y el archivo se arma con el resto', async () => {
    // Sin TRANSLATION, el ULETTER de UNITED sigue saliendo con solo el ULETTER dentro.
    const repo = repoConTodo(new Set(['ULETTER']));
    const { planes } = await planConfigurable('UNITED', repo);

    expect(planes.map((p) => p.name)).toEqual(['ULETTER.pdf']);
    expect(planes[0].sources).toEqual(['ULETTER']);
  });

  it('sin ningún documento, el participante se omite con motivo', async () => {
    const repo = repoConTodo(new Set());
    const { planes, skipReason } = await planConfigurable('UNITED', repo);

    expect(planes).toEqual([]);
    expect(skipReason).toBe('El participante no tiene documentos subidos para combinar.');

    // El camino histórico llega al mismo lugar: sin outputs, el use case lo omite.
    expect(await nuevoBuilder(repo).buildUnitedOutputs(USER_ID)).toEqual([]);
  });

  it('ASPIRE sin ninguna de sus cuatro siglas no genera archivo', async () => {
    const repo = repoConTodo(new Set());

    expect(await nuevoBuilder(repo).buildAspirePdf(USER_ID)).toBeNull();

    const { planes, skipReason } = await planConfigurable('ASPIRE', repo);
    expect(planes).toEqual([]);
    expect(skipReason).not.toBeNull();
  });

  it('AAG sin el adjunto omite al participante, no arma un paquete a medias', async () => {
    const { planes, skipReason } = await planConfigurable('AAG', repoConTodo(), []);

    expect(planes).toEqual([]);
    expect(skipReason).toContain('vacationLetter');
  });

  it('AAG emite el ULETTER aunque el participante no tenga ULETTER ni TRANSLATION', async () => {
    // Es el comportamiento de hoy: el VacationLetter se agrega igual, así que el archivo sale.
    const repo = repoConTodo(new Set());
    const { planes } = await planConfigurable('AAG', repo, [VACATION_LETTER]);

    expect(planes.map((p) => p.name)).toEqual(['ULETTER.pdf']);
    expect(planes[0].sources).toEqual(['input:vacationLetter']);
  });
});
