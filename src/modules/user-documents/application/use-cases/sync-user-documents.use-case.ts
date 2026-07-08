import { Inject, Injectable } from '@nestjs/common';
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
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepo: IDocumentRepository,
  ) {}

  async execute(userId: string, sponsorCode: string | null | undefined): Promise<void> {
    const documents = await this.documentRepo.findBySponsorCode(sponsorCode ?? '');
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

    // `existing` viene ordenado del más reciente al más antiguo (ver repositorio),
    // por lo que el primer valor que se guarda por clave es siempre el más reciente.
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

        const existingRecord = existingByDocSponsorId.get(matchingDs.id);
        if (existingRecord) {
          if (existingRecord.statusDocument !== doc.status) {
            await this.userDocumentsRepo.updateStatusDocument(existingRecord.id, doc.status);
          }
          continue;
        }

        if (!doc.status) continue;

        // El participante cambió de sponsor: si ya tenía este mismo documento avanzado
        // (subido/revisado/observado) bajo otro sponsor, se conserva ese registro como
        // histórico (se desactiva, no se borra ni se reescribe) y se crea uno nuevo para
        // el sponsor actual heredando el mismo estado y archivo.
        const priorRecord = existingByParentDocId.get(doc.id)?.[0];
        if (priorRecord && priorRecord.status !== PENDIENTE_STATUS) {
          const priorHistory = await this.userDocumentsRepo.findHistoryByUserAndTarget(
            userId,
            null,
            priorRecord.documentSponsorId,
          );
          const lastUrl = priorHistory[priorHistory.length - 1]?.url ?? null;

          await this.userDocumentsRepo.updateStatusDocument(priorRecord.id, false);
          alreadyDeactivatedIds.add(priorRecord.id);

          await this.userDocumentsRepo.cloneDocumentForNewSponsor({
            userId,
            documentSponsorId: matchingDs.id,
            status: priorRecord.status,
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
