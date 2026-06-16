import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';
import type { Etiqueta } from '../../domain/etiqueta.entity';

@Injectable()
export class FindOneEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  async execute(id: string): Promise<Etiqueta> {
    const etiqueta = await this.repo.findById(id);
    if (!etiqueta)
      throw new NotFoundException(`Etiqueta #${id} no encontrada.`);
    return etiqueta;
  }
}
