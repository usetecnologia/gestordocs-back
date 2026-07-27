import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class FindOneTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  async execute(id: string): Promise<Temporada> {
    const temporada = await this.repo.findById(id);
    if (!temporada) throw new NotFoundException(`Temporada #${id} no encontrada.`);
    return temporada;
  }
}
