import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IUserDocumentsRepository,
  ExistingUserDocument,
  CreateUserDocumentWithHistoryData,
  UserDocumentWithHistory,
  UserDocumentDocumentInfo,
  RequiredDocsCount,
} from '../../domain/user-documents.repository';

const USER_DOCS_INCLUDE = {
  documentSponsors: {
    include: {
      document: true,
      sponsor: { select: { id: true, name: true, code: true } },
    },
  },
  documents: true,
  userDocumentHistory: {
    include: { etiquetas: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type UserDocRow = Awaited<
  ReturnType<typeof PrismaService.prototype.userDocuments.findMany<{ include: typeof USER_DOCS_INCLUDE }>>
>[number];

function toDocInfo(d: {
  id: string;
  name: string;
  title: string | null;
  type: string;
  instructions: string;
}): UserDocumentDocumentInfo {
  return { id: d.id, name: d.name, title: d.title ?? '', type: d.type, instructions: d.instructions };
}

function mapUserDocToHistory(ud: UserDocRow): UserDocumentWithHistory {
  const ds = ud.documentSponsors;
  return {
    id: ud.id,
    documentSponsorId: ud.documentSponsorId,
    documentId: ud.documentId,
    userId: ud.userId,
    status: ud.status as string,
    statusDocument: ud.statusDocument,
    createdAt: ud.createdAt,
    updatedAt: ud.updatedAt,
    documentSponsor: ds
      ? {
          id: ds.id,
          documentId: ds.documentId,
          sponsorId: ds.sponsorId,
          required: ds.required,
          document: toDocInfo(ds.document),
          sponsor: ds.sponsor,
        }
      : null,
    document: ud.documents ? toDocInfo(ud.documents) : null,
    history: ud.userDocumentHistory.map((h) => ({
      id: h.id,
      userDocumentsId: h.userDocumentsId,
      status: h.status as string,
      url: h.url,
      observation: h.observation,
      etiquetaId: h.etiquetaId,
      etiqueta: h.etiquetas ?? null,
      createdById: h.createdById,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    })),
  };
}

@Injectable()
export class UserDocumentsPrismaRepository implements IUserDocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<ExistingUserDocument[]> {
    const rows = await this.prisma.userDocuments.findMany({ where: { userId } });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      documentSponsorId: r.documentSponsorId,
      documentId: r.documentId,
      status: r.status as string,
      statusDocument: r.statusDocument,
    }));
  }

  async findByUserIdWithHistory(userId: string): Promise<UserDocumentWithHistory[]> {
    const rows = await this.prisma.userDocuments.findMany({
      where: { userId },
      include: USER_DOCS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapUserDocToHistory);
  }

  async findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null> {
    const ud = await this.prisma.userDocuments.findUnique({
      where: { id },
      include: USER_DOCS_INCLUDE,
    });
    return ud ? mapUserDocToHistory(ud) : null;
  }

  async createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void> {
    await this.prisma.userDocuments.create({
      data: {
        userId: data.userId,
        documentSponsorId: data.documentSponsorId ?? null,
        documentId: data.documentId ?? null,
        status: 'PENDIENTE',
        statusDocument: true,
        userDocumentHistory: {
          create: { status: 'PENDIENTE' },
        },
      },
    });
  }

  async updateStatusDocument(id: string, statusDocument: boolean): Promise<void> {
    await this.prisma.userDocuments.update({
      where: { id },
      data: { statusDocument },
    });
  }

  async addHistory(userDocumentsId: string, status: string, url: string): Promise<void> {
    const castedStatus = status as $Enums.DocumentSponsorStatus;
    await this.prisma.$transaction([
      this.prisma.userDocumentHistory.create({
        data: { userDocumentsId, status: castedStatus, url },
      }),
      this.prisma.userDocuments.update({
        where: { id: userDocumentsId },
        data: { status: castedStatus },
      }),
    ]);
  }

  async countRequiredDocs(userId: string): Promise<RequiredDocsCount> {
    const [totalRequired, submittedRequired] = await this.prisma.$transaction([
      this.prisma.userDocuments.count({
        where: { userId, statusDocument: true, documentSponsors: { required: true } },
      }),
      this.prisma.userDocuments.count({
        where: {
          userId,
          statusDocument: true,
          status: $Enums.DocumentSponsorStatus.SUBIDO,
          documentSponsors: { required: true },
        },
      }),
    ]);
    return { totalRequired, submittedRequired };
  }
}
