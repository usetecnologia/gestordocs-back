import { Inject, Injectable } from '@nestjs/common';
import { IProgramRepository, PROGRAM_REPOSITORY } from '../../domain/program.repository';
import type { Program } from '../../domain/program.entity';

@Injectable()
export class FindActiveProgramUseCase {
  constructor(
    @Inject(PROGRAM_REPOSITORY)
    private readonly repo: IProgramRepository,
  ) {}

  execute(): Promise<Program[]> {
    return this.repo.findAllActive();
  }
}
