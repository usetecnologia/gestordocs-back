import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertPackageIsValid,
  assertScopeIsFree,
  assertTemplatesAreValid,
  assertTreeIsCoherent,
} from './sponsor-package.validator';
import {
  CreateSponsorPackageData,
  ISponsorPackageRepository,
} from '../../domain/sponsor-package.repository';
import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from '../../domain/sponsor-package.enums';

/**
 * Estas validaciones son la única defensa contra una regla que compila, se guarda y falla recién
 * cuando alguien pide la descarga — con el ZIP a medio armar. Varias no se pueden expresar como
 * constraint en MariaDB, así que si no están acá no están en ningún lado.
 */

const DOC_ULETTER = '11111111-1111-4111-8111-111111111111';
const DOC_TRANSLATION = '22222222-2222-4222-8222-222222222222';
const DOC_AJENO = '33333333-3333-4333-8333-333333333333';

function repoDoble(overrides: Partial<ISponsorPackageRepository> = {}): ISponsorPackageRepository {
  return {
    findScopeConflict: () => Promise.resolve(null),
    checkReferences: () =>
      Promise.resolve({
        sponsorExists: true,
        programExists: true,
        countryExists: true,
        missingDocumentIds: [],
      }),
    ...overrides,
  } as unknown as ISponsorPackageRepository;
}

function paquete(overrides: Partial<CreateSponsorPackageData> = {}): CreateSponsorPackageData {
  return {
    name: 'UNITED — estándar',
    sponsorId: 'sponsor-1',
    programId: null,
    countryId: null,
    structure: PackageStructure.CARPETA_POR_PARTICIPANTE,
    folderPathTemplate: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    itemNameTemplate: '{dni} - {apellidos}, {nombres}',
    fallbackPrograma: 'SIN PROGRAMA',
    fallbackPais: 'SIN PAIS',
    priority: 0,
    createdById: null,
    inputs: [],
    outputs: [
      {
        filename: 'ULETTER',
        mode: PackageOutputMode.PDF_COMBINADO,
        order: 0,
        emitWhenEmpty: false,
        sources: [
          { documentId: DOC_ULETTER, order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE },
          { documentId: DOC_TRANSLATION, order: 1, onMissing: PackageOnMissing.OMITIR_FUENTE },
        ],
        stamps: [],
      },
    ],
    ...overrides,
  };
}

describe('plantillas', () => {
  it('acepta los tokens del diccionario, en mayúscula o minúscula', () => {
    expect(() =>
      assertTemplatesAreValid(
        paquete({ folderPathTemplate: '{programa}/{PAIS}', itemNameTemplate: '{nombreCompleto}' }),
      ),
    ).not.toThrow();
  });

  it('rechaza un token inventado, que si no quedaría escrito tal cual en el ZIP', () => {
    expect(() => assertTemplatesAreValid(paquete({ itemNameTemplate: '{codigo} - {dni}' }))).toThrow(
      /\{codigo\}/,
    );
  });

  it('acepta texto libre y separadores alrededor de los tokens', () => {
    expect(() =>
      assertTemplatesAreValid(paquete({ folderPathTemplate: 'Envios/{PAIS}/{SPONSOR}' })),
    ).not.toThrow();
  });
});

describe('coherencia del árbol', () => {
  it('exige al menos un archivo', () => {
    expect(() => assertTreeIsCoherent(paquete({ outputs: [] }))).toThrow(BadRequestException);
  });

  it('rechaza dos archivos con el mismo nombre: uno pisaría al otro en el ZIP', () => {
    const output = paquete().outputs[0];
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output, { ...output, order: 1 }] }))).toThrow(
      /dos archivos llamados "ULETTER"/,
    );
  });

  it('rechaza un archivo sin fuentes', () => {
    const output = { ...paquete().outputs[0], sources: [] };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/no tiene ninguna fuente/);
  });

  it('rechaza una fuente que apunta a documento y a adjunto a la vez', () => {
    const output = {
      ...paquete().outputs[0],
      sources: [
        { documentId: DOC_ULETTER, inputSlug: 'vl', order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE },
      ],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/a los dos/);
  });

  it('rechaza una fuente que no apunta a nada', () => {
    const output = {
      ...paquete().outputs[0],
      sources: [{ order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE }],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/a ninguno/);
  });

  it('rechaza un adjunto usado pero no declarado', () => {
    const output = {
      ...paquete().outputs[0],
      sources: [{ inputSlug: 'vacationLetter', order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE }],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output], inputs: [] }))).toThrow(
      /no está declarado/,
    );
  });

  it('rechaza el mismo documento dos veces en un archivo', () => {
    const output = {
      ...paquete().outputs[0],
      sources: [
        { documentId: DOC_ULETTER, order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE },
        { documentId: DOC_ULETTER, order: 1, onMissing: PackageOnMissing.OMITIR_FUENTE },
      ],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/repite el mismo documento/);
  });

  it('un archivo en formato original solo puede tener una fuente: las demás se descartarían', () => {
    const output = { ...paquete().outputs[0], mode: PackageOutputMode.ARCHIVO_ORIGINAL };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/solo puede tener una fuente/);
  });

  it('un archivo en formato original no admite sello: no se convierte, no hay dónde estamparlo', () => {
    const output = {
      ...paquete().outputs[0],
      mode: PackageOutputMode.ARCHIVO_ORIGINAL,
      sources: [{ documentId: DOC_ULETTER, order: 0, onMissing: PackageOnMissing.OMITIR_FUENTE }],
      stamps: [
        {
          assetUrl: 'https://bucket/sello.png',
          onlyDocumentId: DOC_ULETTER,
          widthPt: 120,
          marginXPt: 20,
          marginYPt: 90,
          anchor: PackageStampAnchor.BOTTOM_RIGHT,
        },
      ],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(/no se le puede estampar/);
  });

  it('rechaza un sello que apunta a un documento que el archivo no incluye', () => {
    const output = {
      ...paquete().outputs[0],
      stamps: [
        {
          assetUrl: 'https://bucket/sello.png',
          onlyDocumentId: DOC_AJENO,
          widthPt: 120,
          marginXPt: 20,
          marginYPt: 90,
          anchor: PackageStampAnchor.BOTTOM_RIGHT,
        },
      ],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).toThrow(
      /apunta a un documento que ese archivo no incluye/,
    );
  });

  it('acepta el sello sobre el TRANSLATION, que es la configuración real de ASPIRE', () => {
    const output = {
      ...paquete().outputs[0],
      stamps: [
        {
          assetUrl: 'https://bucket/sello.png',
          onlyDocumentId: DOC_TRANSLATION,
          widthPt: 120,
          marginXPt: 20,
          marginYPt: 90,
          anchor: PackageStampAnchor.BOTTOM_RIGHT,
        },
      ],
    };
    expect(() => assertTreeIsCoherent(paquete({ outputs: [output] }))).not.toThrow();
  });
});

describe('unicidad del alcance', () => {
  it('rechaza un segundo paquete genérico para el mismo sponsor', async () => {
    // Es el caso que el índice único de MariaDB NO detecta, porque considera cada NULL distinto.
    const repo = repoDoble({
      findScopeConflict: () => Promise.resolve({ id: 'otro', name: 'UNITED — viejo' }),
    });

    await expect(assertScopeIsFree(repo, paquete())).rejects.toThrow(ConflictException);
    await expect(assertScopeIsFree(repo, paquete())).rejects.toThrow(/UNITED — viejo/);
  });

  it('el mensaje nombra el alcance en conflicto', async () => {
    const repo = repoDoble({
      findScopeConflict: () => Promise.resolve({ id: 'otro', name: 'X' }),
    });

    await expect(assertScopeIsFree(repo, paquete())).rejects.toThrow(
      /todos los programas y todos los países/,
    );
    await expect(
      assertScopeIsFree(repo, paquete({ programId: 'prog-1', countryId: 'pais-1' })),
    ).rejects.toThrow(/ese programa y ese país/);
  });

  it('al actualizar, el paquete no choca consigo mismo', async () => {
    let excluido: string | undefined;
    const repo = repoDoble({
      findScopeConflict: (_s, _p, _c, excludeId) => {
        excluido = excludeId;
        return Promise.resolve(null);
      },
    });

    await assertScopeIsFree(repo, paquete(), 'pkg-1');
    expect(excluido).toBe('pkg-1');
  });
});

describe('referencias', () => {
  it('rechaza documentos inexistentes o inactivos', async () => {
    const repo = repoDoble({
      checkReferences: () =>
        Promise.resolve({
          sponsorExists: true,
          programExists: true,
          countryExists: true,
          missingDocumentIds: [DOC_TRANSLATION],
        }),
    });

    await expect(assertPackageIsValid(repo, paquete())).rejects.toThrow(/no existen o están inactivos/);
  });

  it('un paquete correcto pasa todas las validaciones', async () => {
    await expect(assertPackageIsValid(repoDoble(), paquete())).resolves.toBeUndefined();
  });
});
