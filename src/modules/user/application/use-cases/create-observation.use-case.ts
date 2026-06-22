import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IUserRepository,
  ObservationResult,
  USER_REPOSITORY,
} from '../../domain/user.repository';
import { CreateObservationDto } from '../../infrastructure/http/dtos/create-observation.dto';

@Injectable()
export class CreateObservationUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  async execute(dto: CreateObservationDto): Promise<ObservationResult> {
    const user = await this.repo.findById(dto.participantId);
    if (!user) throw new NotFoundException(`Usuario #${dto.participantId} no encontrado.`);

    return this.repo.createObservation({
      participantId: dto.participantId,
      observation: dto.observation,
      createdById: dto.createdById,
      etiquetaIds: dto.etiquetaIds,
    });
  }
}
