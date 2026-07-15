import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '@modules/user/domain/user.repository';
import type { User } from '@modules/user/domain/user.entity';
import { resolveDateRange } from '../../domain/resolve-date-range';
import type { DashboardParticipantsQueryDto } from '../../infrastructure/http/dtos/dashboard-participants-query.dto';

@Injectable()
export class FindParticipantsByStatusUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  execute(query: DashboardParticipantsQueryDto): Promise<{ data: User[]; total: number }> {
    const { from, to } = resolveDateRange(query.range, query.dateFrom, query.dateTo);

    return this.userRepository.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      sponsorId: query.sponsorId,
      programId: query.programId,
      countryId: query.countryId,
      createdFrom: from,
      createdTo: to,
    });
  }
}
