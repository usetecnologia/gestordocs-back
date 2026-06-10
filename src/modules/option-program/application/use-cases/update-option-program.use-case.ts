import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OPTION_PROGRAM_REPOSITORY, IOptionProgramRepository } from '../../domain/option-program.repository';
import type { UpdateOptionProgramDto } from '../../infrastructure/http/dtos/update-option-program.dto';
import type { OptionProgram } from '../../domain/option-program.entity';

@Injectable()
export class UpdateOptionProgramUseCase {
  constructor(
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly repo: IOptionProgramRepository,
  ) {}

  async execute(id: string, dto: UpdateOptionProgramDto): Promise<OptionProgram> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Opción de programa #${id} no encontrada.`);
    return this.repo.update(id, dto);
  }
}
