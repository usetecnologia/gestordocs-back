import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TEMPORADA_REPOSITORY, ITemporadaRepository } from '../../domain/temporada.repository';

@Injectable()
export class DeleteTemporadaUseCase {
  constructor(
    @Inject(TEMPORADA_REPOSITORY)
    private readonly repo: ITemporadaRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new NotFoundException(`Temporada #${id} no encontrada.`);

    // La clave foránea (ON DELETE RESTRICT) tambien lo impide, pero devolveria un error de
    // constraint ilegible. Se comprueba antes para poder decir cuantos documentos la usan.
    const inUse = await this.repo.countDocumentProgramsUsing(id);
    if (inUse > 0) {
      throw new ConflictException(
        `No se puede eliminar la temporada "${existing.name}": está asignada a ${inUse} ` +
          `${inUse === 1 ? 'documento' : 'documentos'}. Quítala de esos documentos antes de eliminarla.`,
      );
    }

    await this.repo.delete(id);
  }
}
