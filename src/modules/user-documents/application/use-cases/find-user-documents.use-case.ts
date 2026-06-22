import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  UserDocumentFilter,
  UserDocumentWithHistory,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { SyncUserDocumentsUseCase } from './sync-user-documents.use-case';

@Injectable()
export class FindUserDocumentsUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
  ) {}

  async execute(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]> {
    const sponsorCode = await this.userDocumentsRepo.findUserSponsorCode(userId);
    await this.syncUserDocumentsUseCase.execute(userId, sponsorCode);
    return this.userDocumentsRepo.findByUserIdWithHistory(userId, filter);
  }
}
