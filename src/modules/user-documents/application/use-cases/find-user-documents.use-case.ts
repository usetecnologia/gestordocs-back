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

  /**
   * Con `procesoId` se está revisando un ciclo concreto —archivado— y **no se sincroniza**: un ciclo
   * cerrado está congelado, y el sync trabaja siempre sobre el abierto. Sin él se mira el ciclo en
   * curso y se lo pone al día antes de devolverlo, como siempre.
   */
  async execute(
    userId: string,
    filter?: UserDocumentFilter,
    procesoId?: string,
  ): Promise<UserDocumentWithHistory[]> {
    if (!procesoId) await this.syncUserDocumentsUseCase.execute(userId);
    return this.userDocumentsRepo.findByUserIdWithHistory(userId, filter, procesoId);
  }
}
