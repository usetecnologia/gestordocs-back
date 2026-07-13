import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '@modules/document/domain/document.repository';
import type { Document } from '@modules/document/domain/document.entity';

@Injectable()
export class FindInformativeDocumentsBySponsorsUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepository: IDocumentRepository,
  ) {}

  execute(sponsorIds: string[]): Promise<Document[]> {
    return this.documentRepository.findInformativeBySponsorIds(sponsorIds);
  }
}
