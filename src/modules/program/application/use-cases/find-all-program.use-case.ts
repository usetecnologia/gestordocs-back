import { Inject, Injectable } from '@nestjs/common';
import { PROGRAM_REPOSITORY, IProgramRepository } from '../../domain/program.repository';
import type { FindProgramsQueryDto } from '../../infrastructure/http/dtos/find-programs-query.dto';
import type { Program } from '../../domain/program.entity';

@Injectable()
export class FindAllProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  execute(query: FindProgramsQueryDto): Promise<{ data: Program[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
  }
}
