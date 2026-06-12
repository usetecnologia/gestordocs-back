import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class FindOneDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(id: string): Promise<Document> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new NotFoundException(`Documento #${id} no encontrado.`);
    return doc;
  }
}
