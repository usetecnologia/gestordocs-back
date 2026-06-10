import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OPTION_PROGRAM_REPOSITORY, IOptionProgramRepository } from '../../domain/option-program.repository';
import type { OptionProgram } from '../../domain/option-program.entity';

@Injectable()
export class FindOneOptionProgramUseCase {
  constructor(
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly repo: IOptionProgramRepository,
  ) {}

  async execute(id: string): Promise<OptionProgram> {
    const op = await this.repo.findById(id);
    if (!op) throw new NotFoundException(`Opción de programa #${id} no encontrada.`);
    return op;
  }
}
