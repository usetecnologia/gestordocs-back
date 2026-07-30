import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from 'prisma/generated/prisma/client';
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
  BulkUploadFileData,
  DocumentTargetResult,
  ActiveUserDocumentStatus,
  ParticipantSponsorInfo,
  UserEmailContext,
  UserDocumentTargetHistoryItem,
  CloneDocumentForSponsorData,
  RefreshDocumentFromLatestData,
  PassportDocumentCandidate,
} from '../../domain/user-documents.repository';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * Choque contra los índices únicos de `UserDocuments` (uq_user_documents_sponsor_active /
 * uq_user_documents_document_active), que impiden dos registros activos del mismo documento
 * para un mismo participante.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

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
      userDocumentObservationFiles: {
        select: { id: true, file: true },
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
  instructions: string | null;
  required: boolean;
  order: number | null;
}): UserDocumentDocumentInfo {
  return { id: d.id, name: d.name, title: d.title ?? '', type: d.type, formats: d.formats, instructions: d.instructions, required: d.required, order: d.order };
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
      files: h.userDocumentObservationFiles.map((f) => ({ id: f.id, file: f.file })),
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
  private readonly logger = new Logger(UserDocumentsPrismaRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Descarta el fallo de una escritura de la sincronización cuando lo causó una ejecución
   * concurrente; cualquier otro error se propaga intacto.
   *
   * El sync es idempotente: se re-ejecuta en cada consulta de documentos del participante. Si dos
   * ejecuciones concurren, la que pierde la carrera intenta crear o activar un registro que la otra
   * ya dejó listo y el índice único la rechaza — esa escritura ya no aporta nada. Propagarla
   * convertiría una carrera inofensiva en un error 500.
   */
  private skipIfConcurrentSync(error: unknown, description: string): void {
    if (!isUniqueConstraintViolation(error)) throw error;
    this.logger.warn(`Sincronización concurrente: se omite ${description}.`);
  }

  async findByUserId(userId: string): Promise<ExistingUserDocument[]> {
    // Ordenado por última actividad real (updatedAt), no por fecha de creación del vínculo:
    // así se puede identificar el avance más reciente de un documento entre TODOS los
    // sponsors que alguna vez lo tuvieron, sin importar cuál vínculo es más antiguo.
    const rows = await this.prisma.userDocuments.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      documentSponsorId: r.documentSponsorId,
      documentId: r.documentId,
      status: r.status as string,
      statusDocument: r.statusDocument,
      updatedAt: r.updatedAt,
    }));
  }

  async findUserSponsorCode(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sponsor: { select: { code: true } } },
    });
    return user?.sponsor?.code ?? null;
  }

  async findByUserIdWithHistory(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]> {
    const where: Record<string, unknown> = {
      userId,
      statusDocument: true,
      OR: [{ documentSponsorId: { not: null } }, { documentId: { not: null } }],
    };

    if (filter === UserDocumentFilter.REQUIRED) {
      where['AND'] = [
        {
          OR: [
            { documentSponsors: { required: true } },
            { documentSponsorId: null, documents: { required: true } },
          ],
        },
      ];
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
    try {
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
    } catch (error) {
      const target = data.documentSponsorId ?? data.documentId;
      this.skipIfConcurrentSync(error, `la creación del documento ${target}`);
    }
  }

  async cloneDocumentForNewSponsor({
    userId,
    documentSponsorId,
    status,
    url,
  }: CloneDocumentForSponsorData): Promise<void> {
    const castedStatus = status as $Enums.DocumentSponsorStatus;
    try {
      await this.prisma.userDocuments.create({
        data: {
          userId,
          documentSponsorId,
          status: castedStatus,
          statusDocument: true,
          userDocumentHistory: {
            create: { status: castedStatus, url },
          },
        },
      });
    } catch (error) {
      this.skipIfConcurrentSync(
        error,
        `el clonado del documento ${documentSponsorId}`,
      );
    }
  }

  async refreshDocumentFromLatest({
    userDocumentId,
    status,
    url,
  }: RefreshDocumentFromLatestData): Promise<void> {
    const castedStatus = status as $Enums.DocumentSponsorStatus;
    try {
      await this.prisma.$transaction([
        this.prisma.userDocuments.update({
          where: { id: userDocumentId },
          data: { status: castedStatus, statusDocument: true },
        }),
        this.prisma.userDocumentHistory.create({
          data: { userDocumentsId: userDocumentId, status: castedStatus, url },
        }),
      ]);
    } catch (error) {
      this.skipIfConcurrentSync(
        error,
        `la puesta al día del documento ${userDocumentId}`,
      );
    }
  }

  async updateStatusDocument(id: string, statusDocument: boolean): Promise<void> {
    try {
      await this.prisma.userDocuments.update({
        where: { id },
        data: { statusDocument },
      });
    } catch (error) {
      this.skipIfConcurrentSync(
        error,
        `el cambio de vigencia del documento ${id}`,
      );
    }
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

  async observarDocument({ userDocumentId, observation, etiquetaIds, reviewedById, url, files }: ObservarDocumentData): Promise<void> {
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
          ...(files?.length && {
            userDocumentObservationFiles: {
              create: files.map((file) => ({ file })),
            },
          }),
        },
      });
    });
  }

  async countRequiredDocs(userId: string): Promise<RequiredDocsCount> {
    // Un documento obligatorio es aquel con type DOCUMENT y required:true,
    // ya sea marcado en el vínculo con el sponsor o directamente en el documento.
    const requiredDocFilter = {
      OR: [
        {
          documentSponsors: {
            required: true,
            document: { type: $Enums.TypeDocument.DOCUMENT },
          },
        },
        {
          documentSponsorId: null,
          documents: {
            required: true,
            type: $Enums.TypeDocument.DOCUMENT,
          },
        },
      ],
    };

    const [totalRequired, submittedRequired] = await this.prisma.$transaction([
      this.prisma.userDocuments.count({
        where: {
          userId,
          statusDocument: true,
          AND: [requiredDocFilter],
        },
      }),
      this.prisma.userDocuments.count({
        where: {
          userId,
          statusDocument: true,
          status: {
            in: [
              $Enums.DocumentSponsorStatus.SUBIDO,
              $Enums.DocumentSponsorStatus.EN_REVISION,
              $Enums.DocumentSponsorStatus.REVISADO,
            ],
          },
          AND: [requiredDocFilter],
        },
      }),
    ]);
    return { totalRequired, submittedRequired };
  }

  async findUserIdByDni(dni: string): Promise<string | null> {
    const person = await this.prisma.person.findFirst({ where: { dni }, select: { id: true } });
    if (!person) return null;
    const user = await this.prisma.user.findUnique({ where: { id: person.id }, select: { id: true } });
    return user?.id ?? null;
  }

  async findDocumentTargetBySiglasCode(
    siglasCode: string,
    sponsorCode: string | null,
  ): Promise<DocumentTargetResult> {
    const doc = await this.prisma.documents.findFirst({
      where: { siglasCode, status: true },
      select: {
        id: true,
        documentSponsors: {
          where: { status: true },
          select: { id: true, sponsor: { select: { code: true } } },
        },
      },
    });

    if (!doc) return { found: false };

    // Documento sin vínculos a sponsors: se rastrea directo por documentId.
    if (doc.documentSponsors.length === 0) {
      return { found: true, applicable: true, documentId: doc.id, documentSponsorId: null };
    }

    // Documento específico de sponsor: debe rastrearse por documentSponsorId
    // del vínculo que corresponde al sponsor del participante.
    const matching = doc.documentSponsors.find((ds) => ds.sponsor.code === sponsorCode);
    if (!matching) return { found: true, applicable: false };

    return { found: true, applicable: true, documentId: null, documentSponsorId: matching.id };
  }

  async upsertUserDocumentWithStatus({
    userId,
    documentId,
    documentSponsorId,
    status,
    url,
    createdById,
  }: BulkUploadFileData): Promise<void> {
    const castedStatus = status as $Enums.DocumentSponsorStatus;

    const existing = await this.prisma.userDocuments.findFirst({
      where: { userId, ...(documentSponsorId ? { documentSponsorId } : { documentId }) },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.$transaction([
        this.prisma.userDocuments.update({
          where: { id: existing.id },
          data: { status: castedStatus },
        }),
        this.prisma.userDocumentHistory.create({
          data: { userDocumentsId: existing.id, status: castedStatus, url, createdById },
        }),
      ]);
    } else {
      await this.prisma.userDocuments.create({
        data: {
          userId,
          documentId,
          documentSponsorId,
          status: castedStatus,
          statusDocument: true,
          userDocumentHistory: {
            create: { status: castedStatus, url, createdById },
          },
        },
      });
    }
  }

  async findActiveStatusesByUserIds(userIds: string[]): Promise<ActiveUserDocumentStatus[]> {
    if (!userIds.length) return [];
    const rows = await this.prisma.userDocuments.findMany({
      where: { userId: { in: userIds }, statusDocument: true },
      select: { userId: true, documentId: true, documentSponsorId: true, status: true },
    });
    return rows.map((r) => ({
      userId: r.userId,
      documentId: r.documentId,
      documentSponsorId: r.documentSponsorId,
      status: r.status as string,
    }));
  }

  async hasObservedDocument(userId: string): Promise<boolean> {
    const count = await this.prisma.userDocuments.count({
      where: {
        userId,
        statusDocument: true,
        status: $Enums.DocumentSponsorStatus.OBSERVADO,
      },
    });
    return count > 0;
  }

  async findParticipantInfo(userId: string): Promise<ParticipantSponsorInfo | null> {
    const [user, person] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, sponsor: { select: { code: true } } },
      }),
      this.prisma.person.findUnique({
        where: { id: userId },
        select: { dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
      }),
    ]);
    if (!user) return null;

    return {
      id: user.id,
      dni: person?.dni ?? null,
      firstname: person?.firstname ?? '',
      middlename: person?.middlename ?? null,
      lastfathername: person?.lastfathername ?? '',
      lastmothername: person?.lastmothername ?? null,
      sponsorCode: user.sponsor?.code ?? null,
    };
  }

  async findEmailContextByUserId(userId: string): Promise<UserEmailContext | null> {
    const [user, person] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          program: { select: { name: true } },
          sponsor: { select: { name: true } },
        },
      }),
      this.prisma.person.findUnique({
        where: { id: userId },
        select: { firstname: true, middlename: true, lastfathername: true, lastmothername: true },
      }),
    ]);
    if (!user) return null;

    return {
      email: user.email ?? null,
      nombreParticipante: person
        ? [person.firstname, person.middlename, person.lastfathername, person.lastmothername]
            .filter(Boolean)
            .join(' ')
        : '',
      nombrePrograma: user.program?.name ?? '',
      nombreSponsor: user.sponsor?.name ?? '',
    };
  }

  async findParticipantInfoByDni(dni: string): Promise<ParticipantSponsorInfo | null> {
    const person = await this.prisma.person.findFirst({
      where: { dni },
      select: { id: true, dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
    });
    if (!person) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: person.id },
      select: { id: true, sponsor: { select: { code: true } } },
    });
    if (!user) return null;

    return {
      id: user.id,
      dni: person.dni,
      firstname: person.firstname,
      middlename: person.middlename,
      lastfathername: person.lastfathername,
      lastmothername: person.lastmothername,
      sponsorCode: user.sponsor?.code ?? null,
    };
  }

  async findAllParticipantIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { role: { code: 'PARTICIPANTE' } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async findHistoryByUserAndTarget(
    userId: string,
    documentId: string | null,
    documentSponsorId: string | null,
  ): Promise<UserDocumentTargetHistoryItem[]> {
    const userDoc = await this.prisma.userDocuments.findFirst({
      where: {
        userId,
        ...(documentSponsorId ? { documentSponsorId } : { documentId }),
      },
      select: {
        userDocumentHistory: {
          select: { status: true, url: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return userDoc?.userDocumentHistory ?? [];
  }

  async findUserDocumentIdForTarget(
    userId: string,
    documentId: string,
    sponsorId: string | null,
  ): Promise<string | null> {
    if (sponsorId) {
      const link = await this.prisma.documentSponsor.findFirst({
        where: { documentId, sponsorId, status: true },
        select: { id: true },
      });
      if (!link) return null;

      const userDoc = await this.prisma.userDocuments.findFirst({
        where: { userId, documentSponsorId: link.id },
        select: { id: true },
      });
      return userDoc?.id ?? null;
    }

    const userDoc = await this.prisma.userDocuments.findFirst({
      where: { userId, documentId },
      select: { id: true },
    });
    return userDoc?.id ?? null;
  }

  async findAllPassportDocuments(): Promise<PassportDocumentCandidate[]> {
    const passportDoc = await this.prisma.documents.findFirst({
      where: { siglasCode: 'PASSPORT', status: true },
      select: {
        id: true,
        documentSponsors: { where: { status: true }, select: { id: true } },
      },
    });
    if (!passportDoc) return [];

    const documentSponsorIds = passportDoc.documentSponsors.map((ds) => ds.id);

    // Sin "take": se recorren todos los participantes con pasaporte pendiente de analizar.
    // Varias filas pueden pertenecer al mismo participante (p. ej. si cambió de sponsor) y
    // otras pueden no tener URL aún — se dedupean abajo, quedándose con la más reciente por usuario.
    const rows = await this.prisma.userDocuments.findMany({
      where: {
        statusDocument: true,
        status: { not: $Enums.DocumentSponsorStatus.PENDIENTE },
        OR: [
          { documentId: passportDoc.id },
          ...(documentSponsorIds.length ? [{ documentSponsorId: { in: documentSponsorIds } }] : []),
        ],
      },
      select: {
        id: true,
        userId: true,
        status: true,
        updatedAt: true,
        userDocumentHistory: {
          select: { url: true },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const seenUsers = new Set<string>();
    const candidates: PassportDocumentCandidate[] = [];
    for (const row of rows) {
      if (seenUsers.has(row.userId)) continue;
      const url = row.userDocumentHistory[0]?.url;
      if (!url) continue;

      seenUsers.add(row.userId);
      candidates.push({
        userId: row.userId,
        userDocumentId: row.id,
        status: row.status as string,
        url,
        updatedAt: row.updatedAt,
      });
    }

    return candidates;
  }
}
