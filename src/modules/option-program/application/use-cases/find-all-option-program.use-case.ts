import { Inject, Injectable } from '@nestjs/common';
import { OPTION_PROGRAM_REPOSITORY, IOptionProgramRepository } from '../../domain/option-program.repository';
import type { FindOptionProgramsQueryDto } from '../../infrastructure/http/dtos/find-option-programs-query.dto';
import type { OptionProgram } from '../../domain/option-program.entity';

@Injectable()
export class FindAllOptionProgramUseCase {
  constructor(
    @Inject(OPTION_PROGRAM_REPOSITORY)
    private readonly repo: IOptionProgramRepository,
  ) {}

  execute(query: FindOptionProgramsQueryDto): Promise<{ data: OptionProgram[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      programId: query.programId,
      search: query.search,
    });
  }
}
