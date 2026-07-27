import { Inject, Injectable } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { FindTemporadasQueryDto } from '../../infrastructure/http/dtos/find-temporadas-query.dto';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class FindAllTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  execute(query: FindTemporadasQueryDto): Promise<{ data: Temporada[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      programId: query.programId,
      status: query.status,
      search: query.search,
    });
  }
}
