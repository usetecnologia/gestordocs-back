import { Inject, Injectable } from '@nestjs/common';
import { IDocumentRepository, DOCUMENT_REPOSITORY } from '../../domain/document.repository';
import { Document } from '../../domain/document.entity';

@Injectable()
export class FindAllActiveDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: IDocumentRepository,
  ) {}

  execute(): Promise<Document[]> {
    return this.documentRepository.findAllActive();
  }
}
