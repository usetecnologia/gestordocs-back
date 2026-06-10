import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROGRAM_REPOSITORY, IProgramRepository } from '../../domain/program.repository';

@Injectable()
export class DeleteProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Programa #${id} no encontrado.`);
    await this.repo.delete(id);
  }
}
