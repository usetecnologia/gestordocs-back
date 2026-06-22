import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class UpdateDocumentOrderUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(id: string, order: number | null): Promise<Document> {
    const result = await this.repo.updateOrder(id, order);
    if (!result) throw new NotFoundException(`Documento #${id} no encontrado.`);
    return result;
  }
}
