import type { ProgramModel } from 'prisma/generated/prisma/models';
import type { Prisma } from 'prisma/generated/prisma/client';
import { Program } from '../../domain/program.entity';

// Include opcional: findAll trae las temporadas embebidas; el resto de queries no.
export const PROGRAM_TEMPORADAS_INCLUDE = {
  temporadas: {
    select: { id: true, name: true, status: true },
    orderBy: [{ status: 'desc' }, { name: 'asc' }],
  },
} satisfies Prisma.ProgramInclude;

type ProgramRaw = ProgramModel & {
  temporadas?: { id: string; name: string; status: boolean }[];
};

export class ProgramMapper {
  static toDomain(raw: ProgramRaw): Program {
    return new Program(
      raw.id,
      raw.idExterno ?? null,
      raw.code,
      raw.name,
      raw.status,
      raw.createAt,
      raw.updateAt,
      (raw.temporadas ?? []).map((t) => ({ id: t.id, name: t.name, status: t.status })),
    );
  }
}
