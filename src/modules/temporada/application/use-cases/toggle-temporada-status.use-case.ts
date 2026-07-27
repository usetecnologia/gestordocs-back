import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class ToggleTemporadaStatusUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  // Activa o inactiva la temporada: invierte su estado actual.
  async execute(id: string): Promise<Temporada> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Temporada #${id} no encontrada.`);
    return this.repo.update(id, { status: !existing.status });
  }
}
