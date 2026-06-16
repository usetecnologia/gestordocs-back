import type { Prisma } from 'prisma/generated/prisma/client';
import { Etiqueta } from '../../domain/etiqueta.entity';

export const ETIQUETA_FULL_INCLUDE = {
  createdBy: { select: { id: true, username: true, email: true } },
  updatedBy: { select: { id: true, username: true, email: true } },
} satisfies Prisma.EtiquetasInclude;

export type PrismaEtiquetaFull = Prisma.EtiquetasGetPayload<{
  include: typeof ETIQUETA_FULL_INCLUDE;
}>;

export class EtiquetaMapper {
  static toDomain(raw: PrismaEtiquetaFull): Etiqueta {
    return new Etiqueta(
      raw.id,
      raw.name,
      raw.status,
      raw.createdById,
      raw.updatedById,
      raw.createdAt,
      raw.updatedAt,
      raw.createdBy,
      raw.updatedBy,
    );
  }
}
