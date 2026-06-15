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

    for (const doc of documents) {
      if (doc.sponsors.length > 0) {
        const matchingDs = doc.sponsors.find((s) => s.sponsor.code === sponsorCode);
        if (!matchingDs) continue;

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
  }
}
