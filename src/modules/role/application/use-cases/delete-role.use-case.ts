import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role.repository';

@Injectable()
export class DeleteRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Rol #${id} no encontrado.`);
    await this.repo.delete(id);
  }
}
