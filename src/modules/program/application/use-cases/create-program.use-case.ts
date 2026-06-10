import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PROGRAM_REPOSITORY, IProgramRepository } from '../../domain/program.repository';
import type { CreateProgramDto } from '../../infrastructure/http/dtos/create-program.dto';
import type { Program } from '../../domain/program.entity';

@Injectable()
export class CreateProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  async execute(dto: CreateProgramDto): Promise<Program> {
    if (await this.repo.isCodeTaken(dto.code)) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }
    return this.repo.create(dto);
  }
}
