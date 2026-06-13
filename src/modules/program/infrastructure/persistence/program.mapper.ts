import type { ProgramModel } from 'prisma/generated/prisma/models';
import { Program } from '../../domain/program.entity';

export class ProgramMapper {
  static toDomain(raw: ProgramModel): Program {
    return new Program(raw.id, raw.idExterno ?? null, raw.code, raw.name, raw.status, raw.createAt, raw.updateAt);
  }
}
