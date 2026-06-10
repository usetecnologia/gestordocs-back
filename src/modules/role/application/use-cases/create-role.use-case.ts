import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ROLE_REPOSITORY, IRoleRepository } from '../../domain/role.repository';
import type { CreateRoleDto } from '../../infrastructure/http/dtos/create-role.dto';
import type { Role } from '../../domain/role.entity';

@Injectable()
export class CreateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly repo: IRoleRepository,
  ) {}

  async execute(dto: CreateRoleDto): Promise<Role> {
    if (dto.code && (await this.repo.isCodeTaken(dto.code))) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }
    return this.repo.create(dto);
  }
}
