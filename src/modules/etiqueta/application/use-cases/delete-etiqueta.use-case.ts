import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';

@Injectable()
export class DeleteEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException(`Etiqueta #${id} no encontrada.`);
    await this.repo.delete(id);
  }
}
