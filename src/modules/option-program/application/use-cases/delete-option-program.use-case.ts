import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OPTION_PROGRAM_REPOSITORY, IOptionProgramRepository } from '../../domain/option-program.repository';

@Injectable()
export class DeleteOptionProgramUseCase {
  constructor(
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly repo: IOptionProgramRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Opción de programa #${id} no encontrada.`);
    await this.repo.delete(id);
  }
}
