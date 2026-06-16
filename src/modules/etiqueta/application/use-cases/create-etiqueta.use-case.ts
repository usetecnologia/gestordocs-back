import { Inject, Injectable } from '@nestjs/common';
import {
  ETIQUETA_REPOSITORY,
  IEtiquetaRepository,
} from '../../domain/etiqueta.repository';
import type { CreateEtiquetaDto } from '../../infrastructure/http/dtos/create-etiqueta.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Etiqueta } from '../../domain/etiqueta.entity';

@Injectable()
export class CreateEtiquetaUseCase {
  constructor(
    @Inject(ETIQUETA_REPOSITORY) private readonly repo: IEtiquetaRepository,
  ) {}

  execute(dto: CreateEtiquetaDto, user: JwtPayload): Promise<Etiqueta> {
    return this.repo.create({ ...dto, createdById: user.sub });
  }
}
