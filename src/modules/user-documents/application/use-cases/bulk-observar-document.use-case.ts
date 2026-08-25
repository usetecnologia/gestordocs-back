import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { ObservarDocumentUseCase } from './observar-document.use-case';
import { TerminarRevisionUseCase } from './terminar-revision.use-case';
import { SyncUserDocumentsUseCase } from './sync-user-documents.use-case';
import type {
  BulkReviewDocumentErrorItem,
  BulkReviewDocumentResult,
} from './bulk-aceptar-document.use-case';

const CONCURRENCY = 10;

@Injectable()
export class BulkObservarDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly observarDocumentUseCase: ObservarDocumentUseCase,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
  ) {}

  async execute(
    dnis: string[],
    documentId: string,
    sponsorId: string | undefined,
    observation: string,
    etiquetaIds: string[],
    reviewedById: string,
  ): Promise<BulkReviewDocumentResult> {
    const successes: string[] = [];
    const errors: BulkReviewDocumentErrorItem[] = [];
    const affectedUserIds = new Set<string>();

    for (let i = 0; i < dnis.length; i += CONCURRENCY) {
      const batch = dnis.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((dni) =>
          this.processDni(dni, documentId, sponsorId ?? null, observation, etiquetaIds, reviewedById),
        ),
      );

      results.forEach((result, index) => {
        const dni = batch[index];
        if (result.status === 'fulfilled') {
          successes.push(dni);
          affectedUserIds.add(result.value);
        } else {
          errors.push({
            dni,
            reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });
    }

    await this.terminarRevisionForUsers([...affectedUserIds], reviewedById);

    return { totalSuccess: successes.length, totalErrors: errors.length, successes, errors };
  }

  private async processDni(
    dni: string,
    documentId: string,
    sponsorId: string | null,
    observation: string,
    etiquetaIds: string[],
    reviewedById: string,
  ): Promise<string> {
    const userId = await this.userDocumentsRepo.findUserIdByDni(dni);
    if (!userId) throw new Error(`Usuario con DNI "${dni}" no encontrado.`);

    await this.syncUserDocumentsUseCase.execute(userId);

    // Un ciclo finalizado está congelado: no se edita. El DNI queda listado como omitido.
    //
    // Va DESPUÉS del sync a propósito: el participante que todavía no tiene ningún proceso recibe
    // el primero —abierto— dentro de esa llamada, y preguntando antes se lo omitiría por error.
    // El sync no reabre nada: sobre un ciclo cerrado sale sin tocar el expediente.
    const procesoAbierto = await this.userDocumentsRepo.findProcesoAbiertoByUserId(userId);
    if (!procesoAbierto) {
      throw new Error(
        `El participante con DNI "${dni}" no tiene un proceso en curso (su proceso está finalizado): se omite.`,
      );
    }

    const userDocumentId = await this.userDocumentsRepo.findUserDocumentIdForTarget(
      procesoAbierto.id,
      documentId,
      sponsorId,
    );
    if (!userDocumentId) {
      throw new Error(`El participante con DNI "${dni}" no tiene este documento asignado.`);
    }

    await this.observarDocumentUseCase.execute({ userDocumentId, observation, etiquetaIds }, reviewedById);
    return userId;
  }

  private async terminarRevisionForUsers(userIds: string[], reviewedById: string): Promise<void> {
    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const batch = userIds.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map((userId) => this.terminarRevisionUseCase.execute(userId, reviewedById)),
      );
    }
  }
}
