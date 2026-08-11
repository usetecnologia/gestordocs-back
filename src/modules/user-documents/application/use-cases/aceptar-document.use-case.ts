import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { resolveCurrentFileUrl } from '../../domain/user-document-file';

@Injectable()
export class AceptarDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
  ) {}

  async execute(userDocumentId: string, reviewedById: string): Promise<void> {
    const userDoc =
      await this.userDocumentsRepo.findByIdWithHistory(userDocumentId);
    if (!userDoc)
      throw new NotFoundException(`UserDocument #${userDocumentId} not found`);

    await this.userDocumentsRepo.aceptarDocument({
      userDocumentId,
      reviewedById,
      url: resolveCurrentFileUrl(userDoc.history),
    });
  }
}
