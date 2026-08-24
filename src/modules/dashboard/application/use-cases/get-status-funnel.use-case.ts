import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY, UserStatusCount } from '@modules/user/domain/user.repository';
import { FUNNEL_STATUSES } from '../../domain/status-funnel';
import { resolveDateRange } from '../../domain/resolve-date-range';
import type { DashboardFunnelQueryDto } from '../../infrastructure/http/dtos/dashboard-funnel-query.dto';

@Injectable()
export class GetStatusFunnelUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  execute(query: DashboardFunnelQueryDto): Promise<UserStatusCount[]> {
    const { from, to } = resolveDateRange(query.range, query.dateFrom, query.dateTo);

    return this.userRepository.countByStatus(FUNNEL_STATUSES, {
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
