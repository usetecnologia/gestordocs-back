import { Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role.repository';
import type { FindRolesQueryDto } from '../../infrastructure/http/dtos/find-roles-query.dto';
import type { Role } from '../../domain/role.entity';

@Injectable()
export class FindAllRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  execute(query: FindRolesQueryDto): Promise<{ data: Role[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
  }
}
