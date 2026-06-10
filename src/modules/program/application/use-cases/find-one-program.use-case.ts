import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROGRAM_REPOSITORY, IProgramRepository } from '../../domain/program.repository';
import type { Program } from '../../domain/program.entity';

@Injectable()
export class FindOneProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  async execute(id: string): Promise<Program> {
    const program = await this.repo.findById(id);
    if (!program) throw new NotFoundException(`Programa #${id} no encontrado.`);
    return program;
  }
}
