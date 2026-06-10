import { Inject, Injectable } from '@nestjs/common';
import { OPTION_PROGRAM_REPOSITORY, IOptionProgramRepository } from '../../domain/option-program.repository';
import type { CreateOptionProgramDto } from '../../infrastructure/http/dtos/create-option-program.dto';
import type { OptionProgram } from '../../domain/option-program.entity';

@Injectable()
export class CreateOptionProgramUseCase {
  constructor(
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly repo: IOptionProgramRepository,
  ) {}

  execute(dto: CreateOptionProgramDto): Promise<OptionProgram> {
    return this.repo.create({ ...dto, hideJobFair: dto.hideJobFair ?? false });
  }
}
