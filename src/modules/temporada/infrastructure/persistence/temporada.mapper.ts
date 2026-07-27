import type { TemporadaGetPayload } from 'prisma/generated/prisma/models';
import { Temporada } from '../../domain/temporada.entity';

export const TEMPORADA_INCLUDE = {
  program: { select: { id: true, name: true, code: true } },
} as const;

export type PrismaTemporadaFull = TemporadaGetPayload<{
  include: typeof TEMPORADA_INCLUDE;
}>;

export class TemporadaMapper {
  static toDomain(raw: PrismaTemporadaFull): Temporada {
    return new Temporada(
      raw.id,
      raw.programId,
      raw.name,
      raw.status,
      raw.createAt,
      raw.updateAt,
      raw.program ?? null,
    );
  }
}
