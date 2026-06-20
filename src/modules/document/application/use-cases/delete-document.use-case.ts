import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';

@Injectable()
export class DeleteDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(id: string): Promise<{ message: string }> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Documento #${id} no encontrado.`);
    await this.repo.delete(id);
    return { message: 'Documento eliminado correctamente.' };
  }
}
