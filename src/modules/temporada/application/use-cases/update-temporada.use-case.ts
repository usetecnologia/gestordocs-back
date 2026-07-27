import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';
import type { UpdateTemporadaDto } from '../../infrastructure/http/dtos/update-temporada.dto';
import type { Temporada } from '../../domain/temporada.entity';

@Injectable()
export class UpdateTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  async execute(id: string, dto: UpdateTemporadaDto): Promise<Temporada> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Temporada #${id} no encontrada.`);

    const name = dto.name?.trim();
    if (name) {
      const programId = dto.programId ?? existing.programId;
      if (await this.repo.isNameTaken(name, programId, id)) {
        throw new ConflictException(
          `Ya existe una temporada con el nombre "${name}" en este programa.`,
        );
      }
    }

    return this.repo.update(id, { ...dto, ...(name && { name }) });
  }
}
