import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  DocumentCountryItem,
  IDocumentRepository,
} from '../../domain/document.repository';

@Injectable()
export class FindDocumentCountriesUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(documentId: string): Promise<DocumentCountryItem[]> {
    const doc = await this.repo.findById(documentId);
    if (!doc) throw new NotFoundException(`Documento #${documentId} no encontrado.`);
    return this.repo.findCountriesByDocumentId(documentId);
  }
}
