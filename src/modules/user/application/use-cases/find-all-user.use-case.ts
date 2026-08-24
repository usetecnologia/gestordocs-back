import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { FindUsersQueryDto } from '../../infrastructure/http/dtos/find-users-query.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class FindAllUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  /**
   * Una fila por **proceso**, no por participante: quien tuvo dos ciclos aparece dos veces, cada vez
   * con el suyo. Los filtros de ciclo —estado, sponsor, programa, opción, país— se aplican al
   * proceso de la fila; ver `findAllByProceso`.
   */
  execute(query: FindUsersQueryDto): Promise<{ data: User[]; total: number }> {
    return this.repo.findAllByProceso({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      roleId: query.roleId,
      countryId: query.countryId,
      sponsorId: query.sponsorId,
      hasSponsor: query.hasSponsor,
      programId: query.programId,
      programIds: query.programIds,
      optionProgramId: query.optionProgramId,
      statusSolRetiro: query.statusSolRetiro,
      generalStatus: query.generalStatus,
      procesoEstado: query.procesoEstado,
      fechaEnvioSponsor: query.fechaEnvioSponsor,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'asc',
    });
  }
}
