import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';
import type { UpdateEtiquetaDto } from '../../infrastructure/http/dtos/update-etiqueta.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Etiqueta } from '../../domain/etiqueta.entity';

@Injectable()
export class UpdateEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  async execute(
    id: string,
    dto: UpdateEtiquetaDto,
    user: JwtPayload,
  ): Promise<Etiqueta> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException(`Etiqueta #${id} no encontrada.`);
    return this.repo.update(id, { ...dto, updatedById: user.sub });
  }
}
