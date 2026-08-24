import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '@modules/user/domain/user.repository';
import { UserStatus } from '@modules/user/domain/user.enums';
import type { User } from '@modules/user/domain/user.entity';
import { resolveDateRange } from '../../domain/resolve-date-range';
import type { DashboardParticipantsQueryDto } from '../../infrastructure/http/dtos/dashboard-participants-query.dto';

@Injectable()
export class FindParticipantsByStatusUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  async execute(query: DashboardParticipantsQueryDto): Promise<{ data: User[]; total: number }> {
    const { from, to } = resolveDateRange(query.range, query.dateFrom, query.dateTo);

    // El status seleccionado (ej. PREPARACION) ya no es el status actual — es el estado
    // que tenían justo antes de pasar a INACTIVO. Se resuelve a ids primero y luego se
    // reutiliza findAll con status=INACTIVO + esos ids, sin duplicar la paginación/mapeo.
    if (query.generalStatus === 'INACTIVO') {
      const ids = await this.userRepository.findInactiveIdsByPreviousStatus(query.status, {
        sponsorId: query.sponsorId,
        programId: query.programId,
        programIds: query.programIds,
        countryId: query.countryId,
        createdFrom: from,
        createdTo: to,
      });

      return this.userRepository.findAll({
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        status: UserStatus.INACTIVO,
        ids,
      });
    }

    return this.userRepository.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      sponsorId: query.sponsorId,
      programId: query.programId,
      programIds: query.programIds,
      countryId: query.countryId,
      createdFrom: from,
      createdTo: to,
      generalStatus: query.generalStatus,
    });
  }
}
