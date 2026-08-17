import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ExistingUserDocument,
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  IDocumentRepository,
  DOCUMENT_REPOSITORY,
} from '@modules/document/domain/document.repository';

const PENDIENTE_STATUS = 'PENDIENTE';

@Injectable()
export class SyncUserDocumentsUseCase {
  private readonly logger = new Logger(SyncUserDocumentsUseCase.name);

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepo: IDocumentRepository,
  ) {}

  /**
   * El contexto de aplicabilidad (sponsor + programa) se resuelve aquí a partir del `userId`,
   * no se recibe por parámetro: hay siete caminos que sincronizan un expediente y así ninguno
   * puede quedar pasando datos distintos ni desactualizarse cuando se agregue una dimensión.
   */
  async execute(userId: string): Promise<void> {
    const context = await this.userDocumentsRepo.findUserApplicabilityContext(userId);

    // Sin programa o sin país no se puede decidir qué documentos aplican. Se sale sin tocar
    // nada en vez de desactivar el expediente completo: el filtro estricto haría que ningún
    // documento calce, y perder un expediente por un dato faltante es peor que no sincronizar.
    if (!context?.programId || !context.countryId) {
      const falta = !context?.programId ? 'programa' : 'país';
      this.logger.warn(
        `Sync omitido para el usuario ${userId}: no tiene ${falta} asignado. ` +
          'Su expediente queda intacto hasta que se le asigne uno.',
      );
      return;
    }

    const { sponsorCode } = context;
    const documents = await this.documentRepo.findApplicableForParticipant(context);
    const existing = await this.userDocumentsRepo.findByUserId(userId);

    // Mapea cada vínculo documento-sponsor (DocumentSponsor.id) al documento padre al que
    // pertenece. Un mismo documento (p. ej. "SPONSOR") puede tener un vínculo distinto por
    // cada sponsor que lo requiere — este mapa permite reconocer que todos esos vínculos
    // representan el MISMO documento físico, sin importar cuál sponsor lo exige.
    const parentDocByLinkId = new Map<string, string>();
    for (const doc of documents) {
      for (const link of doc.sponsors) {
        parentDocByLinkId.set(link.id, doc.id);
      }
    }

    // `existing` viene ordenado por última actividad real (updatedAt) del más reciente al
    // más antiguo (ver repositorio) — por lo que el primer valor que se guarda por clave es
    // siempre el de actividad más reciente.
    const existingByDocSponsorId = new Map<string, ExistingUserDocument>();
    const existingByDocId = new Map<string, ExistingUserDocument>();
    const existingByParentDocId = new Map<string, ExistingUserDocument[]>();

    for (const e of existing) {
      if (e.documentSponsorId) {
        if (!existingByDocSponsorId.has(e.documentSponsorId)) {
          existingByDocSponsorId.set(e.documentSponsorId, e);
        }
        const parentDocId = parentDocByLinkId.get(e.documentSponsorId);
        if (parentDocId) {
          const group = existingByParentDocId.get(parentDocId);
          if (group) group.push(e);
          else existingByParentDocId.set(parentDocId, [e]);
        }
      } else if (e.documentId && !existingByDocId.has(e.documentId)) {
        existingByDocId.set(e.documentId, e);
      }
    }

    // Track which identifiers are still valid for this user in this sync pass
    const validDocSponsorIds = new Set<string>();
    const validDocIds = new Set<string>();
    const alreadyDeactivatedIds = new Set<string>();

    for (const doc of documents) {
      if (doc.sponsors.length > 0) {
        const matchingDs = doc.sponsors.find((s) => s.sponsor.code === sponsorCode);
        if (!matchingDs) continue;

        validDocSponsorIds.add(matchingDs.id);

        const currentLinkRecord = existingByDocSponsorId.get(matchingDs.id);

        // El registro con progreso real (no PENDIENTE) más reciente entre TODOS los
        // sponsors que alguna vez tuvieron este documento — no solo el sponsor actual.
        // El grupo ya viene ordenado por última actividad (updatedAt) descendente.
        const group = existingByParentDocId.get(doc.id) ?? [];
        const bestRecord = group.find((r) => r.status !== PENDIENTE_STATUS);

        if (currentLinkRecord) {
          if (!bestRecord || bestRecord.id === currentLinkRecord.id) {
            // El registro del sponsor actual ya es el más reciente (o no hay nada mejor
            // que heredar): solo se sincroniza si el documento sigue vigente.
            if (currentLinkRecord.statusDocument !== doc.status) {
              await this.userDocumentsRepo.updateStatusDocument(currentLinkRecord.id, doc.status);
            }
            continue;
          }

          // Otro sponsor tiene el avance MÁS RECIENTE de este mismo documento (p. ej. el
          // participante volvió a un sponsor anterior, pero subió un archivo más nuevo
          // mientras estaba con otro sponsor). Se refresca el registro del sponsor actual
          // con ese estado/archivo y se desactiva el otro (sin borrar su historial).
          const bestHistory = await this.userDocumentsRepo.findHistoryByUserAndTarget(
            userId,
            null,
            bestRecord.documentSponsorId,
          );
          const lastUrl = bestHistory[bestHistory.length - 1]?.url ?? null;

          await this.userDocumentsRepo.refreshDocumentFromLatest({
            userDocumentId: currentLinkRecord.id,
            status: bestRecord.status,
            url: lastUrl,
          });
          await this.userDocumentsRepo.updateStatusDocument(bestRecord.id, false);
          alreadyDeactivatedIds.add(bestRecord.id);
          continue;
        }

        if (!doc.status) continue;

        if (bestRecord) {
          // El participante nunca tuvo este documento bajo el sponsor actual, pero sí bajo
          // otro con progreso real: se clona ese estado/archivo para el sponsor actual y se
          // desactiva el registro de origen (se conserva como histórico, no se borra).
          const bestHistory = await this.userDocumentsRepo.findHistoryByUserAndTarget(
            userId,
            null,
            bestRecord.documentSponsorId,
          );
          const lastUrl = bestHistory[bestHistory.length - 1]?.url ?? null;

          await this.userDocumentsRepo.updateStatusDocument(bestRecord.id, false);
          alreadyDeactivatedIds.add(bestRecord.id);

          await this.userDocumentsRepo.cloneDocumentForNewSponsor({
            userId,
            documentSponsorId: matchingDs.id,
            status: bestRecord.status,
            url: lastUrl,
          });
        } else {
          await this.userDocumentsRepo.createWithHistory({ userId, documentSponsorId: matchingDs.id });
        }
      } else {
        validDocIds.add(doc.id);

        const existingRecord = existingByDocId.get(doc.id);
        if (existingRecord) {
          if (existingRecord.statusDocument !== doc.status) {
            await this.userDocumentsRepo.updateStatusDocument(existingRecord.id, doc.status);
          }
        } else {
          if (!doc.status) continue;
          await this.userDocumentsRepo.createWithHistory({ userId, documentId: doc.id });
        }
      }
    }

    // Deactivate records that are no longer valid for this user.
    // This covers cases where a document's structure changed (e.g. moved from "visible to ALL"
    // to "sponsor-specific") and the user's sponsor no longer qualifies.
    for (const record of existing) {
      if (!record.statusDocument || alreadyDeactivatedIds.has(record.id)) continue;

      if (record.documentSponsorId) {
        if (!validDocSponsorIds.has(record.documentSponsorId)) {
          await this.userDocumentsRepo.updateStatusDocument(record.id, false);
        }
      } else if (record.documentId) {
        if (!validDocIds.has(record.documentId)) {
          await this.userDocumentsRepo.updateStatusDocument(record.id, false);
        }
      }
    }
  }
}
