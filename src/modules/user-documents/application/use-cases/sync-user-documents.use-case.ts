import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  IDocumentRepository,
  DOCUMENT_REPOSITORY,
} from '@modules/document/domain/document.repository';

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

    const existingByDocSponsorId = new Map(
      existing.filter((e) => e.documentSponsorId).map((e) => [e.documentSponsorId!, e]),
    );
    const existingByDocId = new Map(
      existing.filter((e) => e.documentId && !e.documentSponsorId).map((e) => [e.documentId!, e]),
    );

    // Track which identifiers are still valid for this user in this sync pass
    const validDocSponsorIds = new Set<string>();
    const validDocIds = new Set<string>();

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
        } else {
          if (!doc.status) continue;
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
      if (!record.statusDocument) continue;

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
