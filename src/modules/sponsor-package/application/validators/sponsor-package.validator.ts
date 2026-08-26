import { BadRequestException, ConflictException } from '@nestjs/common';
import { findUnknownTokens } from '../../domain/package-templates';
import {
  CreateSponsorPackageData,
  ISponsorPackageRepository,
  UpdateSponsorPackageData,
} from '../../domain/sponsor-package.repository';

/**
 * Las reglas que la base no puede garantizar sola. Se validan acá, una sola vez, para que crear,
 * actualizar y duplicar no puedan divergir.
 */

type PackageData = CreateSponsorPackageData | UpdateSponsorPackageData;

/**
 * Unicidad del alcance.
 *
 * No es un `@@unique` porque MariaDB considera cada NULL distinto: el índice
 * `(sponsor_id, program_id, country_id)` dejaría pasar dos paquetes `(UNITED, NULL, NULL)`, que es
 * justo el caso a impedir. Con dos genéricos activos para el mismo sponsor, cuál gana lo decidiría
 * el desempate por `priority` y fecha — silenciosamente.
 */
export async function assertScopeIsFree(
  repo: ISponsorPackageRepository,
  data: PackageData,
  excludeId?: string,
): Promise<void> {
  const conflicto = await repo.findScopeConflict(
    data.sponsorId,
    data.programId,
    data.countryId,
    excludeId,
  );
  if (!conflicto) return;

  const alcance = [
    data.programId ? 'ese programa' : 'todos los programas',
    data.countryId ? 'ese país' : 'todos los países',
  ].join(' y ');

  throw new ConflictException(
    `Ya existe un paquete activo para este sponsor con ${alcance}: "${conflicto.name}". ` +
      'Desactivalo o cambiá el alcance de uno de los dos.',
  );
}

/** Las plantillas solo pueden usar tokens del diccionario. Un token inventado queda visible en el ZIP. */
export function assertTemplatesAreValid(data: PackageData): void {
  const problemas: string[] = [];

  for (const [campo, plantilla] of [
    ['la plantilla de carpeta', data.folderPathTemplate],
    ['la plantilla de nombre', data.itemNameTemplate],
  ] as const) {
    const desconocidos = findUnknownTokens(plantilla);
    if (desconocidos.length) {
      problemas.push(`${campo} usa tokens que no existen: ${desconocidos.map((t) => `{${t}}`).join(', ')}`);
    }
  }

  if (problemas.length) throw new BadRequestException(problemas.join('. '));
}

/**
 * Coherencia interna del árbol. Todo esto produciría, si pasara, un paquete que falla recién al
 * momento de la descarga — con el participante ya esperando el ZIP.
 */
export function assertTreeIsCoherent(data: PackageData): void {
  const problemas: string[] = [];

  if (!data.outputs.length) {
    problemas.push('El paquete tiene que tener al menos un archivo de salida');
  }

  const slugs = new Set(data.inputs.map((i) => i.slug));
  if (slugs.size !== data.inputs.length) {
    problemas.push('Hay dos adjuntos con el mismo identificador');
  }

  const nombres = new Set<string>();
  for (const output of data.outputs) {
    if (nombres.has(output.filename)) {
      problemas.push(`Hay dos archivos llamados "${output.filename}"`);
    }
    nombres.add(output.filename);

    if (!output.sources.length) {
      problemas.push(`El archivo "${output.filename}" no tiene ninguna fuente`);
    }

    const documentos = new Set<string>();
    for (const source of output.sources) {
      const tieneDoc = !!source.documentId;
      const tieneInput = !!source.inputSlug;

      if (tieneDoc === tieneInput) {
        problemas.push(
          `Una fuente de "${output.filename}" tiene que apuntar a un documento o a un adjunto, no a ${
            tieneDoc ? 'los dos' : 'ninguno'
          }`,
        );
        continue;
      }

      if (tieneInput && !slugs.has(source.inputSlug!)) {
        problemas.push(
          `El archivo "${output.filename}" usa el adjunto "${source.inputSlug}", que no está declarado`,
        );
      }

      if (tieneDoc) {
        if (documentos.has(source.documentId!)) {
          problemas.push(`El archivo "${output.filename}" repite el mismo documento dos veces`);
        }
        documentos.add(source.documentId!);
      }
    }

    // Un archivo en formato original entrega UNA fuente, la primera con archivo. Varias fuentes
    // ahí no combinan nada: las demás se descartarían en silencio.
    if (output.mode === 'ARCHIVO_ORIGINAL' && output.sources.length > 1) {
      problemas.push(
        `El archivo "${output.filename}" se entrega en formato original, así que solo puede tener una fuente`,
      );
    }

    for (const stamp of output.stamps) {
      if (stamp.onlyDocumentId && !documentos.has(stamp.onlyDocumentId)) {
        problemas.push(
          `El sello de "${output.filename}" apunta a un documento que ese archivo no incluye`,
        );
      }
      if (stamp.widthPt <= 0) {
        problemas.push(`El sello de "${output.filename}" tiene que tener un ancho mayor que cero`);
      }
    }

    if (output.mode === 'ARCHIVO_ORIGINAL' && output.stamps.length) {
      problemas.push(
        `El archivo "${output.filename}" se entrega sin convertir, así que no se le puede estampar un sello`,
      );
    }
  }

  if (problemas.length) throw new BadRequestException(problemas.join('. '));
}

/** Sponsor, programa, país y documentos tienen que existir y estar activos. */
export async function assertReferencesExist(
  repo: ISponsorPackageRepository,
  data: PackageData,
): Promise<void> {
  const documentIds = [
    ...new Set(
      data.outputs.flatMap((o) => [
        ...o.sources.map((s) => s.documentId).filter((id): id is string => !!id),
        ...o.stamps.map((s) => s.onlyDocumentId).filter((id): id is string => !!id),
      ]),
    ),
  ];

  const result = await repo.checkReferences({
    sponsorId: data.sponsorId,
    programId: data.programId,
    countryId: data.countryId,
    documentIds,
  });

  const problemas: string[] = [];
  if (!result.sponsorExists) problemas.push('El sponsor indicado no existe');
  if (!result.programExists) problemas.push('El programa indicado no existe');
  if (!result.countryExists) problemas.push('El país indicado no existe');
  if (result.missingDocumentIds.length) {
    problemas.push(
      `Estos documentos no existen o están inactivos: ${result.missingDocumentIds.join(', ')}`,
    );
  }

  if (problemas.length) throw new BadRequestException(problemas.join('. '));
}

/** Todas las validaciones, en el orden en que conviene reportarlas. */
export async function assertPackageIsValid(
  repo: ISponsorPackageRepository,
  data: PackageData,
  excludeId?: string,
): Promise<void> {
  assertTemplatesAreValid(data);
  assertTreeIsCoherent(data);
  await assertReferencesExist(repo, data);
  await assertScopeIsFree(repo, data, excludeId);
}
