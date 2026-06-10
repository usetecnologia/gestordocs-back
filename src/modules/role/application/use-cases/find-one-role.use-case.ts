import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role.repository';
import type { Role } from '../../domain/role.entity';

@Injectable()
export class FindOneRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  async execute(id: string): Promise<Role> {
    const role = await this.repo.findById(id);
    if (!role) throw new NotFoundException(`Rol #${id} no encontrado.`);
    return role;
  }
}
