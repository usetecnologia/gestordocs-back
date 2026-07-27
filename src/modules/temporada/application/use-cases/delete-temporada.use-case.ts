import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';

@Injectable()
export class DeleteTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Temporada #${id} no encontrada.`);
    await this.repo.delete(id);
  }
}
