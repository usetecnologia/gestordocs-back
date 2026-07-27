import type { OptionProgramGetPayload } from 'prisma/generated/prisma/models';
import { OptionProgram } from '../../domain/option-program.entity';

export const OPTION_PROGRAM_INCLUDE = {
  program: { select: { id: true, name: true, code: true } },
} as const;

export type PrismaOptionProgramFull = OptionProgramGetPayload<{
  include: typeof OPTION_PROGRAM_INCLUDE;
}>;

export class OptionProgramMapper {
  static toDomain(raw: PrismaOptionProgramFull): OptionProgram {
    return new OptionProgram(
      raw.id,
      raw.shortDatabase,
      raw.programId,
      raw.status,
      raw.createAt,
      raw.updateAt,
      raw.program ?? null,
    );
  }
}
