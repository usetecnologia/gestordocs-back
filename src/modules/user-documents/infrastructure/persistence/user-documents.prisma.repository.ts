import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IUserDocumentsRepository,
  ExistingUserDocument,
  CreateUserDocumentWithHistoryData,
  UserDocumentWithHistory,
  UserDocumentDocumentInfo,
  UserDocumentFilter,
  RequiredDocsCount,
  AceptarDocumentData,
  ObservarDocumentData,
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
    include: {
      userDocumentHistoryEtiquetas: {
        include: { etiquetas: { select: { id: true, name: true } } },
      },
    },
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
  formats: string | null;
  instructions: string;
}): UserDocumentDocumentInfo {
  return { id: d.id, name: d.name, title: d.title ?? '', type: d.type, formats: d.formats, instructions: d.instructions };
}

function mapUserDocToHistory(ud: UserDocRow, personMap: Map<string, string>): UserDocumentWithHistory {
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
          order: ds.order,
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
      etiquetas: h.userDocumentHistoryEtiquetas.map((e) => e.etiquetas),
      createdById: h.createdById,
      createdBy: h.createdById && personMap.has(h.createdById)
        ? { id: h.createdById, fullName: personMap.get(h.createdById)! }
        : null,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    })),
  };
}

async function buildPersonMap(
  prisma: PrismaService,
  rows: UserDocRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => r.userDocumentHistory.map((h) => h.createdById))
        .filter((id): id is string => id !== null),
    ),
  ];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const persons = await prisma.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
  });
  for (const p of persons) {
    map.set(
      p.id,
      [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' '),
    );
  }
  return map;
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

  async findByUserIdWithHistory(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]> {
    const where: Record<string, unknown> = { userId, statusDocument: true };

    if (filter === UserDocumentFilter.REQUIRED) {
      where['documentSponsors'] = { required: true };
    } else if (filter === UserDocumentFilter.OBSERVED) {
      where['status'] = $Enums.DocumentSponsorStatus.OBSERVADO;
    }

    const rows = await this.prisma.userDocuments.findMany({
      where,
      include: USER_DOCS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const personMap = await buildPersonMap(this.prisma, rows);
    return rows.map((ud) => mapUserDocToHistory(ud, personMap));
  }

  async findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null> {
    const ud = await this.prisma.userDocuments.findUnique({
      where: { id },
      include: USER_DOCS_INCLUDE,
    });
    if (!ud) return null;
    const personMap = await buildPersonMap(this.prisma, [ud]);
    return mapUserDocToHistory(ud, personMap);
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

  async addHistory(userDocumentsId: string, status: string, url: string, createdById: string): Promise<void> {
    const castedStatus = status as $Enums.DocumentSponsorStatus;
    await this.prisma.$transaction([
      this.prisma.userDocumentHistory.create({
        data: { userDocumentsId, status: castedStatus, url, createdById },
      }),
      this.prisma.userDocuments.update({
        where: { id: userDocumentsId },
        data: { status: castedStatus },
      }),
    ]);
  }

  async aceptarDocument({ userDocumentId, reviewedById, url }: AceptarDocumentData): Promise<void> {
    const status = $Enums.DocumentSponsorStatus.REVISADO;
    await this.prisma.$transaction([
      this.prisma.userDocuments.update({
        where: { id: userDocumentId },
        data: { status },
      }),
      this.prisma.userDocumentHistory.create({
        data: { userDocumentsId: userDocumentId, status, createdById: reviewedById, url },
      }),
    ]);
  }

  async observarDocument({ userDocumentId, observation, etiquetaIds, reviewedById, url }: ObservarDocumentData): Promise<void> {
    const status = $Enums.DocumentSponsorStatus.OBSERVADO;
    await this.prisma.$transaction(async (tx) => {
      await tx.userDocuments.update({
        where: { id: userDocumentId },
        data: { status },
      });
      await tx.userDocumentHistory.create({
        data: {
          userDocumentsId: userDocumentId,
          status,
          observation,
          createdById: reviewedById,
          url,
          userDocumentHistoryEtiquetas: {
            create: etiquetaIds.map((etiquetaId) => ({ etiquetaId })),
          },
        },
      });
    });
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
