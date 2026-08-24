import type { ProcesoModel } from 'prisma/generated/prisma/models';
import { Proceso, ProcesoEstado } from '../../domain/proceso.entity';

export class ProcesoMapper {
  static toDomain(raw: ProcesoModel): Proceso {
    return new Proceso(
      raw.id,
      raw.participanteId,
      raw.programId,
      raw.optionProgramId,
      raw.countryId,
      raw.sponsorId,
      raw.temporadaId,
      raw.estado as ProcesoEstado,
      raw.statusDocumental,
      raw.activo,
      raw.fechaIngreso,
    );
  }
}
