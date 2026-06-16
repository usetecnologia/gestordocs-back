import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';
import type { ObservarDocumentDto } from '../../infrastructure/http/dtos/review-document.dto';

@Injectable()
export class ObservarDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT)
    private readonly userStatusPort: IUserStatusPort,
  ) {}

  async execute(dto: ObservarDocumentDto, reviewedById: string): Promise<void> {
    const userDoc = await this.userDocumentsRepo.findByIdWithHistory(dto.userDocumentId);
    if (!userDoc) throw new NotFoundException(`UserDocument #${dto.userDocumentId} not found`);

    const lastSubido = [...userDoc.history]
      .reverse()
      .find((h) => h.status === 'SUBIDO');

    await this.userDocumentsRepo.observarDocument({
      userDocumentId: dto.userDocumentId,
      observation: dto.observation,
      etiquetaIds: dto.etiquetaIds,
      reviewedById,
      url: lastSubido?.url ?? null,
    });

    await this.userStatusPort.updateStatus(userDoc.userId, 'OBSERVADO');
  }
}
