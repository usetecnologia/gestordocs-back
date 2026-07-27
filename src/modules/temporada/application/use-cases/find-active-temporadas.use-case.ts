import { Inject, Injectable } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class FindActiveTemporadasUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  execute(programIds: string[]): Promise<Temporada[]> {
    if (programIds.length === 0) return Promise.resolve([]);
    return this.repo.findActiveByProgramIds(programIds);
  }
}
