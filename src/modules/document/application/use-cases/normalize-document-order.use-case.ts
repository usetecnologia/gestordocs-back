import { Inject, Injectable } from '@nestjs/common';
import { IDocumentRepository, DOCUMENT_REPOSITORY } from '../../domain/document.repository';
import { Document } from '../../domain/document.entity';

@Injectable()
export class NormalizeDocumentOrderUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: IDocumentRepository,
  ) {}

  execute(): Promise<Document[]> {
    return this.documentRepository.normalizeOrder();
  }
}
