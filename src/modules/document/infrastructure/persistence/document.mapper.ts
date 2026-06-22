import type { Prisma } from 'prisma/generated/prisma/client';
import { Document, DocumentSponsorItem } from '../../domain/document.entity';
import { TypeDocument, TypeHired } from '../../domain/document.enums';

export const DOCUMENT_FULL_INCLUDE = {
  createdBy: { select: { id: true, username: true, email: true } },
  updatedBy: { select: { id: true, username: true, email: true } },
  documentSponsors: {
    include: { sponsor: { select: { id: true, name: true, code: true } } },
    orderBy: { order: 'asc' as const },
  },
} satisfies Prisma.DocumentsInclude;

export type PrismaDocumentFull = Prisma.DocumentsGetPayload<{
  include: typeof DOCUMENT_FULL_INCLUDE;
}>;

export class DocumentMapper {
  static toDomain(raw: PrismaDocumentFull): Document {
    const sponsors: DocumentSponsorItem[] = raw.documentSponsors.map((ds) => ({
      id: ds.id,
      sponsorId: ds.sponsorId,
      sponsor: ds.sponsor,
      required: ds.required,
      order: ds.order,
      status: ds.status,
    }));

    return new Document(
      raw.id,
      raw.title ?? '',
      raw.name,
      raw.type as unknown as TypeDocument,
      raw.formats,
      raw.showHired as unknown as TypeHired,
      raw.siglasCode,
      raw.order,
      raw.instructions,
      raw.required,
      raw.status,
      raw.createdById,
      raw.updatedById,
      raw.createdAt,
      raw.updatedAt,
      sponsors,
      raw.createdBy,
      raw.updatedBy,
    );
  }
}
