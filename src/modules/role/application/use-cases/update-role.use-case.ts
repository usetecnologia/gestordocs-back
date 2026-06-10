import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role.repository';
import type { UpdateRoleDto } from '../../infrastructure/http/dtos/update-role.dto';
import type { Role } from '../../domain/role.entity';

@Injectable()
export class UpdateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  async execute(id: string, dto: UpdateRoleDto): Promise<Role> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Rol #${id} no encontrado.`);

    if (dto.code && (await this.repo.isCodeTaken(dto.code, id))) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }

    return this.repo.update(id, dto);
  }
}
