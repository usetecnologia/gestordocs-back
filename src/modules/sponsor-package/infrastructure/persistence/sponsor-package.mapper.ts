import type { Prisma } from 'prisma/generated/prisma/client';
import { SponsorPackage } from '../../domain/sponsor-package.entity';
import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from '../../domain/sponsor-package.enums';

/**
 * El árbol completo de un paquete. Los `orderBy` viajan en el include y no en el motor: el orden de
 * las fuentes dentro de un archivo **es** la regla (define en qué secuencia se combinan las páginas),
 * así que la base lo devuelve ya ordenado y nadie más tiene que acordarse de ordenarlo.
 *
 * De `document` solo se traen sigla y nombre, que son informativos. La identidad del documento es
 * `document_id` y con eso se resuelve la aplicabilidad.
 */
export const SPONSOR_PACKAGE_FULL_INCLUDE = {
  sponsor: { select: { id: true, code: true } },
  inputs: { orderBy: { slug: 'asc' } },
  outputs: {
    where: { status: true },
    orderBy: { order: 'asc' },
    include: {
      sources: {
        orderBy: { order: 'asc' },
        include: {
          document: { select: { siglasCode: true, name: true } },
          input: { select: { slug: true } },
        },
      },
      stamps: { orderBy: { createdAt: 'asc' } },
    },
  },
} satisfies Prisma.SponsorPackageInclude;

export type PrismaSponsorPackageFull = Prisma.SponsorPackageGetPayload<{
  include: typeof SPONSOR_PACKAGE_FULL_INCLUDE;
}>;

export class SponsorPackageMapper {
  static toDomain(raw: PrismaSponsorPackageFull): SponsorPackage {
    return {
      id: raw.id,
      name: raw.name,
      sponsorId: raw.sponsorId,
      sponsorCode: raw.sponsor.code,
      programId: raw.programId,
      countryId: raw.countryId,
      structure: raw.structure as unknown as PackageStructure,
      folderPathTemplate: raw.folderPathTemplate,
      itemNameTemplate: raw.itemNameTemplate,
      fallbackPrograma: raw.fallbackPrograma,
      fallbackPais: raw.fallbackPais,
      priority: raw.priority,
      createdAt: raw.createdAt,
      inputs: raw.inputs.map((input) => ({
        id: input.id,
        slug: input.slug,
        label: input.label,
        required: input.required,
        mimeType: input.mimeType,
        maxSizeMb: input.maxSizeMb,
        archiveToS3: input.archiveToS3,
        s3Folder: input.s3Folder,
        archiveFilename: input.archiveFilename,
      })),
      outputs: raw.outputs.map((output) => ({
        id: output.id,
        filename: output.filename,
        mode: output.mode as unknown as PackageOutputMode,
        order: output.order,
        emitWhenEmpty: output.emitWhenEmpty,
        sources: output.sources.map((source) => ({
          id: source.id,
          documentId: source.documentId,
          inputId: source.inputId,
          documentSiglasCode: source.document?.siglasCode ?? null,
          documentName: source.document?.name ?? null,
          inputSlug: source.input?.slug ?? null,
          order: source.order,
          onMissing: source.onMissing as unknown as PackageOnMissing,
        })),
        stamps: output.stamps.map((stamp) => ({
          id: stamp.id,
          assetUrl: stamp.assetUrl,
          onlyDocumentId: stamp.onlyDocumentId,
          widthPt: stamp.widthPt,
          marginXPt: stamp.marginXPt,
          marginYPt: stamp.marginYPt,
          anchor: stamp.anchor as unknown as PackageStampAnchor,
        })),
      })),
    };
  }
}
