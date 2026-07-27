import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { CreateTemporadaDto } from '../../infrastructure/http/dtos/create-temporada.dto';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class CreateTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  async execute(dto: CreateTemporadaDto): Promise<Temporada> {
    const name = dto.name.trim();
    if (await this.repo.isNameTaken(name, dto.programId)) {
      throw new ConflictException(`Ya existe una temporada con el nombre "${name}" en este programa.`);
    }
    return this.repo.create({ ...dto, name });
  }
}
