import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class FindPendingDocumentsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  execute(sponsorCode: string): Promise<Document[]> {
    return this.repo.findBySponsorCode(sponsorCode);
  }
}
