import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  UserDocumentWithHistory,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';

@Injectable()
export class FindUserDocumentsUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
  ) {}

  execute(userId: string): Promise<UserDocumentWithHistory[]> {
    return this.userDocumentsRepo.findByUserIdWithHistory(userId);
  }
}
