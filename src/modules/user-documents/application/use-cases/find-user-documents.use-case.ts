import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  UserDocumentFilter,
  UserDocumentWithHistory,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';

@Injectable()
export class FindUserDocumentsUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
  ) {}

  execute(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]> {
    return this.userDocumentsRepo.findByUserIdWithHistory(userId, filter);
  }
}
