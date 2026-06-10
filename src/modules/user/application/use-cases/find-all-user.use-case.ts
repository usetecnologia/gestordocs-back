import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { FindUsersQueryDto } from '../../infrastructure/http/dtos/find-users-query.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class FindAllUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  execute(query: FindUsersQueryDto): Promise<{ data: User[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      roleId: query.roleId,
      countryId: query.countryId,
      sponsorId: query.sponsorId,
      programId: query.programId,
      optionProgramId: query.optionProgramId,
      search: query.search,
    });
  }
}
