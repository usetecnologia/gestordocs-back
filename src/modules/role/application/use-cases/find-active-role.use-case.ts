import { Inject, Injectable } from '@nestjs/common';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/role.repository';
import type { Role } from '../../domain/role.entity';

@Injectable()
export class FindActiveRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  execute(): Promise<Role[]> {
    return this.repo.findAllActive();
  }
}
