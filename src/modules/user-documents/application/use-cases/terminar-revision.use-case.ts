import { Inject, Injectable } from '@nestjs/common';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
  UserDocumentFilter,
  UserDocumentWithHistory,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';

@Injectable()
export class TerminarRevisionUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT)
    private readonly userStatusPort: IUserStatusPort,
    private readonly emailDispatchService: EmailDispatchService,
  ) {}

  async execute(participantId: string, createdById?: string): Promise<void> {
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

    const observedDocs = docs.filter((d) => d.status === 'OBSERVADO');

    // 0. Tiene una observación vigente (activa y sin endDate) → se mantiene/pasa a OBSERVADO
    if (await this.userStatusPort.hasActiveObservation(participantId)) {
      await this.setObservado(participantId, createdById, observedDocs);
      return;
    }

    // 1. Existe algún documento OBSERVADO → participante pasa a OBSERVADO
    if (observedDocs.length > 0) {
      await this.setObservado(participantId, createdById, observedDocs);
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

    // 4. Algún documento obligatorio sigue en PENDIENTE.
    //    Si hay obligatorios subidos aún sin revisar (SUBIDO/EN_REVISION) → DOCUMENTOS_SUBIDOS.
    //    Si todos los subidos ya fueron aprobados (REVISADO) o ninguno se subió → DOCUMENTOS_INCOMPLETOS.
    if (requiredDocs.some((d) => d.status === 'PENDIENTE')) {
      const hayEnEsperaDeRevision = requiredDocs.some(
        (d) => d.status === 'SUBIDO' || d.status === 'EN_REVISION',
      );
      const nuevoEstado = hayEnEsperaDeRevision ? 'DOCUMENTOS_SUBIDOS' : 'DOCUMENTOS_INCOMPLETOS';
      await this.userStatusPort.updateStatus(participantId, nuevoEstado, createdById);
      return;
    }

    // 5. Todos los obligatorios entregados pero no todos revisados → PENDIENTE_REVISAR
    await this.userStatusPort.updateStatus(participantId, 'PENDIENTE_REVISAR', createdById);
  }

  private async setObservado(
    participantId: string,
    createdById: string | undefined,
    observedDocs: UserDocumentWithHistory[],
  ): Promise<void> {
    const previousStatus = await this.userStatusPort.getStatus(participantId);
    await this.userStatusPort.updateStatus(participantId, 'OBSERVADO', createdById);

    // Un solo correo por revisión sin importar cuántos documentos se observaron por separado
    // (evita mandar uno por cada documento). Solo se envía en la transición real hacia
    // OBSERVADO — si el participante ya estaba OBSERVADO, una nueva llamada a terminar-revisión
    // no debe reenviar el mismo correo.
    if (observedDocs.length === 0 || previousStatus === 'OBSERVADO') return;

    const emailContext = await this.userDocumentsRepo.findEmailContextByUserId(participantId);
    const nombreDocumento = [
      ...new Set(
        observedDocs
          .map((d) => d.documentSponsor?.document.title || d.document?.title || '')
          .filter(Boolean),
      ),
    ].join(', ');

    await this.emailDispatchService.dispatchByActionCode('DOCUMENTO_OBSERVADO', {
      email: emailContext?.email,
      userId: participantId,
      nombreParticipante: emailContext?.nombreParticipante,
      nombrePrograma: emailContext?.nombrePrograma,
      nombreSponsor: emailContext?.nombreSponsor,
      nombreDocumento,
    });
  }
}
