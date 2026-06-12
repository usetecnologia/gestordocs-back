import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { FindDocumentsQueryDto } from '../../infrastructure/http/dtos/find-documents-query.dto';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class FindAllDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  execute(query: FindDocumentsQueryDto): Promise<{ data: Document[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      type: query.type,
      showHired: query.showHired,
      status: query.status,
      search: query.search,
    });
  }
}
