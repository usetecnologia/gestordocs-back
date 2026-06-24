import type { OptionProgramGetPayload } from 'prisma/generated/prisma/models';
import { OptionProgram } from '../../domain/option-program.entity';

export const OPTION_PROGRAM_INCLUDE = {
  country: { select: { id: true, name: true, code: true } },
  program: { select: { id: true, name: true, code: true } },
  sponsor: { select: { id: true, name: true, code: true } },
} as const;

export type PrismaOptionProgramFull = OptionProgramGetPayload<{
  include: typeof OPTION_PROGRAM_INCLUDE;
}>;

export class OptionProgramMapper {
  static toDomain(raw: PrismaOptionProgramFull): OptionProgram {
    return new OptionProgram(
      raw.id,
      raw.idExterno ?? null,
      raw.name,
      raw.shortName,
      raw.shortDatabase,
      raw.countryId,
      raw.programId,
      raw.sponsorId ?? null,
      raw.status,
      raw.hideJobFair,
      raw.createAt,
      raw.updateAt,
      raw.country ?? null,
      raw.program ?? null,
      raw.sponsor ?? null,
    );
  }
}
