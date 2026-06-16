import { Inject, Injectable } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';
import type { Etiqueta } from '../../domain/etiqueta.entity';

@Injectable()
export class FindActiveEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  execute(): Promise<Etiqueta[]> {
    return this.repo.findAllActive();
  }
}
