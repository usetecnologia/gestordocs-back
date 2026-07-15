import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';

@Injectable()
export class AceptarDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly emailDispatchService: EmailDispatchService,
  ) {}

  async execute(userDocumentId: string, reviewedById: string): Promise<void> {
    const userDoc = await this.userDocumentsRepo.findByIdWithHistory(userDocumentId);
    if (!userDoc) throw new NotFoundException(`UserDocument #${userDocumentId} not found`);

    const lastSubido = [...userDoc.history]
      .reverse()
      .find((h) => h.status === 'SUBIDO');

    await this.userDocumentsRepo.aceptarDocument({
      userDocumentId,
      reviewedById,
      url: lastSubido?.url ?? null,
    });

    const emailContext = await this.userDocumentsRepo.findEmailContextByUserId(userDoc.userId);
    await this.emailDispatchService.dispatchByActionCode('DOCUMENTO_APROBADO', {
      email: emailContext?.email,
      nombreParticipante: emailContext?.nombreParticipante,
      nombrePrograma: emailContext?.nombrePrograma,
      nombreSponsor: emailContext?.nombreSponsor,
      nombreDocumento: userDoc.documentSponsor?.document.title || userDoc.document?.title || '',
    });
  }
}
