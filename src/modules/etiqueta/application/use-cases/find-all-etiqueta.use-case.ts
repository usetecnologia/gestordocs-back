import { Inject, Injectable } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';
import type { FindEtiquetasQueryDto } from '../../infrastructure/http/dtos/find-etiquetas-query.dto';
import type { Etiqueta } from '../../domain/etiqueta.entity';

@Injectable()
export class FindAllEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  execute(
    query: FindEtiquetasQueryDto,
  ): Promise<{ data: Etiqueta[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
  }
}
