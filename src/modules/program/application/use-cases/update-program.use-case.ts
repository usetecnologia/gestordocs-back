import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROGRAM_REPOSITORY, IProgramRepository } from '../../domain/program.repository';
import type { UpdateProgramDto } from '../../infrastructure/http/dtos/update-program.dto';
import type { Program } from '../../domain/program.entity';

@Injectable()
export class UpdateProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  async execute(id: string, dto: UpdateProgramDto): Promise<Program> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Programa #${id} no encontrado.`);

    if (dto.code && (await this.repo.isCodeTaken(dto.code, id))) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }

    return this.repo.update(id, dto);
  }
}
