import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
  UserDocumentFilter,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';

@Injectable()
export class TerminarRevisionUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT)
    private readonly userStatusPort: IUserStatusPort,
  ) {}

  async execute(participantId: string, createdById: string): Promise<void> {
    const docs = await this.userDocumentsRepo.findByUserIdWithHistory(
      participantId,
      UserDocumentFilter.ALL,
    );

    // Documentos obligatorios de tipo DOCUMENT (con o sin sponsor)
    const requiredDocs = docs.filter((d) => {
      if (d.documentSponsor) {
        return d.documentSponsor.required && d.documentSponsor.document.type === 'DOCUMENT';
      }
      return (d.document?.required ?? false) && d.document?.type === 'DOCUMENT';
    });

    // 0. Tiene una observación vigente (activa y sin endDate) → se mantiene/pasa a OBSERVADO
    if (await this.userStatusPort.hasActiveObservation(participantId)) {
      await this.userStatusPort.updateStatus(participantId, 'OBSERVADO', createdById);
      return;
    }

    // 1. Existe algún documento OBSERVADO → participante pasa a OBSERVADO
    if (docs.some((d) => d.status === 'OBSERVADO')) {
      await this.userStatusPort.updateStatus(participantId, 'OBSERVADO', createdById);
      return;
    }

    // 2. Sin documentos o todos en PENDIENTE → SIN_DOCUMENTOS
    if (docs.length === 0 || docs.every((d) => d.status === 'PENDIENTE')) {
      await this.userStatusPort.updateStatus(participantId, 'SIN_DOCUMENTOS', createdById);
      return;
    }

    // 3. Todos los obligatorios están REVISADO → PREPARACION
    if (requiredDocs.length > 0 && requiredDocs.every((d) => d.status === 'REVISADO')) {
      await this.userStatusPort.updateStatus(participantId, 'PREPARACION', createdById);
      return;
    }

    // 4. Algún documento obligatorio sigue en PENDIENTE → DOCUMENTOS_INCOMPLETOS
    if (requiredDocs.some((d) => d.status === 'PENDIENTE')) {
      await this.userStatusPort.updateStatus(participantId, 'DOCUMENTOS_INCOMPLETOS', createdById);
      return;
    }

    // 5. Todos los obligatorios entregados pero no todos revisados → PENDIENTE_REVISAR
    await this.userStatusPort.updateStatus(participantId, 'PENDIENTE_REVISAR', createdById);
  }
}
