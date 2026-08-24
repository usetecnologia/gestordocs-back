import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  MYSQL_TEXT_MAX_BYTES,
  exceedsByteLimit,
  truncateToBytes,
} from '@common/utils/text.util';
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
  PassportDocumentCandidate,
  UserApplicabilityContext,
} from '../../domain/user-documents.repository';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** Contexto vacío: sin programa ni país no hay texto por país que resolver. */
const EMPTY_APPLICABILITY_CONTEXT: UserApplicabilityContext = {
  sponsorCode: null,
  programId: null,
  countryId: null,
};

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

/** Texto configurado para la combinación (programa, país) del participante. */
interface ProgramText {
  title: string;
  description: string;
}

function toDocInfo(
  d: {
    id: string;
    name: string;
    title: string | null;
    type: string;
    formats: string | null;
    instructions: string | null;
    required: boolean;
    order: number | null;
  },
  programTextByDocId: Map<string, ProgramText>,
): UserDocumentDocumentInfo {
  const programText = programTextByDocId.get(d.id);
  return {
    id: d.id,
    name: d.name,
    title: d.title ?? '',
    type: d.type,
    formats: d.formats,
    instructions: d.instructions,
    required: d.required,
    order: d.order,
    programTitle: programText?.title ?? null,
    programDescription: programText?.description ?? null,
  };
}

function mapUserDocToHistory(
  ud: UserDocRow,
  personMap: Map<string, string>,
  programTextByDocId: Map<string, ProgramText>,
): UserDocumentWithHistory {
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
          document: toDocInfo(ds.document, programTextByDocId),
          sponsor: ds.sponsor,
        }
      : null,
    document: ud.documents ? toDocInfo(ud.documents, programTextByDocId) : null,
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

/**
 * Restringe las filas de `UserDocuments` a los documentos que aplican al programa Y al país del
 * participante — el mismo criterio estricto de `findApplicableForParticipant`, pero evaluado en
 * la LECTURA.
 *
 * El sync ya desactiva lo que no aplica, pero eso deja el expediente visible a merced de que el
 * sync haya corrido bien: si se omitió (participante sin programa o país en ese momento), si una
 * desactivación falló, o si alguien insertó/reactivó un registro por otra vía, el participante
 * termina viendo documentos de otro país. Filtrando también al leer, lo que se muestra es siempre
 * el expediente de su país sin depender del estado en que quedó `statusDocument`.
 *
 * Devuelve `null` cuando el participante no tiene programa o país: sin esas dos dimensiones no hay
 * nada con qué decidir y se prefiere no filtrar antes que mostrarle un expediente vacío — mismo
 * criterio que el sync, que en ese caso se omite en vez de desactivar todo.
 */
function programCountryScopeFilter(
  context: UserApplicabilityContext,
): Prisma.UserDocumentsWhereInput | null {
  const { programId, countryId } = context;
  if (!programId || !countryId) return null;

  const applicable: Prisma.DocumentsWhereInput = {
    documentPrograms: {
      some: {
        programId,
        status: true,
        descriptions: { some: { countries: { some: { countryId } } } },
      },
    },
  };

  // Un `UserDocuments` apunta al documento por una de dos vías (documentId directo o a través
  // del vínculo con el sponsor): el país se valida sobre el documento padre en ambos casos.
  return {
    OR: [
      { documentId: { not: null }, documents: applicable },
      { documentSponsorId: { not: null }, documentSponsors: { document: applicable } },
    ],
  };
}

/**
 * Resuelve, por documento, el título y la descripción configurados para la combinación
 * (programa, país) del participante. El unique `uq_document_program_country` garantiza que un
 * país aparece en una sola descripción por documento-programa, así que hay a lo sumo una
 * coincidencia y no hace falta desempatar.
 */
async function buildProgramTextMap(
  prisma: PrismaService,
  rows: UserDocRow[],
  context: UserApplicabilityContext,
): Promise<Map<string, ProgramText>> {
  const map = new Map<string, ProgramText>();
  const { programId, countryId } = context;
  if (!programId || !countryId) return map;

  const documentIds = [
    ...new Set(
      rows
        .map((r) => r.documentId ?? r.documentSponsors?.documentId ?? null)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (!documentIds.length) return map;

  const descriptions = await prisma.documentProgramDescription.findMany({
    where: {
      documentProgram: { documentId: { in: documentIds }, programId, status: true },
      countries: { some: { countryId } },
    },
    select: {
      title: true,
      description: true,
      documentProgram: { select: { documentId: true } },
    },
  });

  for (const d of descriptions) {
    map.set(d.documentProgram.documentId, { title: d.title, description: d.description });
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

  /**
   * Proceso al que se cuelga un documento que se está creando: el abierto del participante y, si
   * no tiene ninguno abierto, el más reciente. Es la regla de "proceso visible", la misma que usó
   * el backfill de `proceso_id`, para que la base y el código no puedan discrepar.
   *
   * `UserDocuments.procesoId` es NOT NULL: un documento sin proceso no tendría dueño histórico. La
   * sincronización abre el proceso con `EnsureProcesoInicial` antes de llegar acá, y se abstiene de
   * tocar el expediente si no puede abrirlo — así que llegar sin proceso significa que otro camino
   * está creando documentos para un participante que no debería tenerlos todavía. Se corta con un
   * error en vez de escribir a medias.
   */
  private async resolveProcesoId(userId: string): Promise<string> {
    const proceso = await this.prisma.proceso.findFirst({
      where: { participanteId: userId },
      orderBy: [{ activo: 'desc' }, { fechaIngreso: 'desc' }],
      select: { id: true },
    });
    if (!proceso) {
      throw new ConflictException(
        `El participante ${userId} no tiene un proceso abierto: no se le puede crear el documento.`,
      );
    }
    return proceso.id;
  }

  /**
   * Proceso visible del participante, con el que se acota TODA lectura de su expediente.
   *
   * Sin esto, una consulta por `userId` devuelve los documentos de todos los ciclos que el
   * participante haya tenido: en su pantalla verría los del ciclo nuevo y los del archivado
   * mezclados, y el recálculo de estado los contaría a todos —un OBSERVADO del ciclo anterior lo
   * sacaría de SIN_DOCUMENTOS sin que haya subido nada—. El participante nunca ve procesos
   * anteriores.
   *
   * Devuelve `null` cuando no tiene proceso visible: el staff, que no tiene expediente, y el caso
   * de datos roto. Quien llama responde vacío, no "todo".
   */
  private async procesoVisibleId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { procesoVisibleId: true },
    });
    return user?.procesoVisibleId ?? null;
  }

  async findByProcesoId(procesoId: string): Promise<ExistingUserDocument[]> {
    // Acotado al proceso: el expediente de un ciclo no se mezcla con el de otro. Sigue ordenado
    // por última actividad real (updatedAt) para que, si dentro del mismo proceso hubiera dos
    // filas del mismo documento, la que el sync tome como vigente sea la de actividad más
    // reciente y no una cualquiera.
    const rows = await this.prisma.userDocuments.findMany({
      where: { procesoId },
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

  async findUserApplicabilityContext(userId: string): Promise<UserApplicabilityContext | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { programId: true, countryId: true, sponsor: { select: { code: true } } },
    });
    if (!user) return null;
    return {
      sponsorCode: user.sponsor?.code ?? null,
      programId: user.programId,
      countryId: user.countryId,
    };
  }

  async findByUserIdWithHistory(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]> {
    // Solo el ciclo que el participante ve. Sin proceso no hay expediente que mostrar.
    const procesoId = await this.procesoVisibleId(userId);
    if (!procesoId) return [];

    // El contexto se resuelve antes de consultar porque ahora alimenta dos cosas: el alcance
    // (programa + país) de la consulta y los textos por país del mapeo.
    const context = await this.findUserApplicabilityContext(userId);

    const conditions: Prisma.UserDocumentsWhereInput[] = [
      { OR: [{ documentSponsorId: { not: null } }, { documentId: { not: null } }] },
    ];

    const scope = programCountryScopeFilter(context ?? EMPTY_APPLICABILITY_CONTEXT);
    if (scope) conditions.push(scope);

    if (filter === UserDocumentFilter.REQUIRED) {
      conditions.push({
        OR: [
          { documentSponsors: { required: true } },
          { documentSponsorId: null, documents: { required: true } },
        ],
      });
    }

    const where: Prisma.UserDocumentsWhereInput = {
      procesoId,
      statusDocument: true,
      AND: conditions,
      ...(filter === UserDocumentFilter.OBSERVED
        ? { status: $Enums.DocumentSponsorStatus.OBSERVADO }
        : {}),
    };

    const rows = await this.prisma.userDocuments.findMany({
      where,
      include: USER_DOCS_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    const [personMap, programTextMap] = await Promise.all([
      buildPersonMap(this.prisma, rows),
      buildProgramTextMap(this.prisma, rows, context ?? EMPTY_APPLICABILITY_CONTEXT),
    ]);
    return rows.map((ud) => mapUserDocToHistory(ud, personMap, programTextMap));
  }

  async findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null> {
    const ud = await this.prisma.userDocuments.findUnique({
      where: { id },
      include: USER_DOCS_INCLUDE,
    });
    if (!ud) return null;
    const context = await this.findUserApplicabilityContext(ud.userId);
    const [personMap, programTextMap] = await Promise.all([
      buildPersonMap(this.prisma, [ud]),
      buildProgramTextMap(this.prisma, [ud], context ?? EMPTY_APPLICABILITY_CONTEXT),
    ]);
    return mapUserDocToHistory(ud, personMap, programTextMap);
  }

  async createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void> {
    try {
      await this.prisma.userDocuments.create({
        data: {
          userId: data.userId,
          procesoId: data.procesoId,
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
    const safeObservation = this.fitObservation(observation, userDocumentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.userDocuments.update({
        where: { id: userDocumentId },
        data: { status },
      });
      await tx.userDocumentHistory.create({
        data: {
          userDocumentsId: userDocumentId,
          status,
          observation: safeObservation,
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

  /**
   * Ajusta la observación a la capacidad real de la columna. Perder el final de un texto
   * desmedido es preferible a que el INSERT falle y la transacción se lleve consigo el cambio de
   * estado del documento y del participante, que es lo que pasó en la revisión masiva del 4/8/2026
   * cuando la columna todavía era `varchar(191)`.
   */
  private fitObservation(observation: string, userDocumentId: string): string {
    if (!exceedsByteLimit(observation, MYSQL_TEXT_MAX_BYTES))
      return observation;

    this.logger.warn(
      `Observación demasiado larga para UserDocument #${userDocumentId} ` +
        `(${Buffer.byteLength(observation, 'utf8')} bytes): se recorta a ${MYSQL_TEXT_MAX_BYTES}.`,
    );
    return truncateToBytes(observation, MYSQL_TEXT_MAX_BYTES);
  }

  async countRequiredDocs(userId: string): Promise<RequiredDocsCount> {
    // Se cuenta sobre el MISMO alcance (programa + país) con el que el participante ve su
    // expediente: si se contara sobre todas sus filas activas, un documento de otro país que
    // quedó sin desactivar lo dejaría eternamente en DOCUMENTOS_INCOMPLETOS pese a haber
    // subido todo lo que la vista le pide.
    // Acotado tambien al ciclo visible: contar los documentos del ciclo archivado dejaria al
    // participante con un avance que no es el suyo.
    const procesoId = await this.procesoVisibleId(userId);
    if (!procesoId) return { totalRequired: 0, submittedRequired: 0 };

    const context = await this.findUserApplicabilityContext(userId);
    const scope = programCountryScopeFilter(context ?? EMPTY_APPLICABILITY_CONTEXT);

    // Un documento obligatorio es aquel con type DOCUMENT y required:true,
    // ya sea marcado en el vínculo con el sponsor o directamente en el documento.
    const requiredDocFilter: Prisma.UserDocumentsWhereInput = {
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

    const conditions = scope ? [requiredDocFilter, scope] : [requiredDocFilter];

    const [totalRequired, submittedRequired] = await this.prisma.$transaction([
      this.prisma.userDocuments.count({
        where: {
          procesoId,
          statusDocument: true,
          AND: conditions,
        },
      }),
      this.prisma.userDocuments.count({
        where: {
          procesoId,
          statusDocument: true,
          status: {
            in: [
              $Enums.DocumentSponsorStatus.SUBIDO,
              $Enums.DocumentSponsorStatus.EN_REVISION,
              $Enums.DocumentSponsorStatus.REVISADO,
            ],
          },
          AND: conditions,
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
    { sponsorCode, programId, countryId }: UserApplicabilityContext,
  ): Promise<DocumentTargetResult> {
    const doc = await this.prisma.documents.findFirst({
      where: { siglasCode, status: true },
      select: {
        id: true,
        documentPrograms: {
          where: { status: true },
          select: {
            programId: true,
            descriptionCountries: { select: { countryId: true } },
          },
        },
        documentSponsors: {
          where: { status: true },
          select: { id: true, sponsor: { select: { code: true } } },
        },
      },
    });

    if (!doc) return { found: false };

    // Mismo criterio estricto de programa y país que `findApplicableForParticipant`: si el
    // documento no está configurado para el programa del participante, o no tiene descripción
    // para su país, no le corresponde. Sin esto la carga masiva por nombre de archivo podría
    // crear un registro que el sync desactiva en la siguiente pasada.
    const programaAplica =
      !!programId &&
      !!countryId &&
      doc.documentPrograms.some(
        (dp) =>
          dp.programId === programId &&
          dp.descriptionCountries.some((dc) => dc.countryId === countryId),
      );

    if (!programaAplica) return { found: true, applicable: false };

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

    // Se busca dentro del proceso al que se va a colgar el archivo, no en todo el historial del
    // participante: si existiera la misma fila en un ciclo archivado, se actualizaria esa.
    const procesoId = await this.resolveProcesoId(userId);

    const existing = await this.prisma.userDocuments.findFirst({
      where: { procesoId, ...(documentSponsorId ? { documentSponsorId } : { documentId }) },
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
          procesoId,
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

    // Acotado al proceso visible de cada participante: el export muestra el ciclo que el
    // participante ve, no la suma de todos los que tuvo. Se resuelve con los punteros ya guardados
    // en `User.procesoVisibleId` en vez de una subconsulta por fila — para eso existe la columna.
    //
    // A diferencia de `email-audience`, acá el proceso visible puede estar finalizado y se incluye
    // igual: el export tiene que mostrar el último estado conocido, no una fila vacía.
    const visibles = await this.prisma.user.findMany({
      where: { id: { in: userIds }, procesoVisibleId: { not: null } },
      select: { procesoVisibleId: true },
    });
    const procesoIds = visibles
      .map((u) => u.procesoVisibleId)
      .filter((id): id is string => id !== null);
    if (!procesoIds.length) return [];

    const rows = await this.prisma.userDocuments.findMany({
      where: { procesoId: { in: procesoIds }, statusDocument: true },
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
    // Un OBSERVADO del ciclo archivado no dice nada del ciclo en curso: este era el camino por el
    // que un participante recien reabierto salia de SIN_DOCUMENTOS sin haber subido nada.
    const procesoId = await this.procesoVisibleId(userId);
    if (!procesoId) return false;

    const count = await this.prisma.userDocuments.count({
      where: {
        procesoId,
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
    const procesoId = await this.procesoVisibleId(userId);
    if (!procesoId) return [];

    const userDoc = await this.prisma.userDocuments.findFirst({
      where: {
        procesoId,
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
    // La accion cae sobre la fila del ciclo en curso. Sin esto, una revision masiva podria aterrizar
    // en el expediente archivado, que por diseno no vuelve a cambiar.
    const procesoId = await this.procesoVisibleId(userId);
    if (!procesoId) return null;

    if (sponsorId) {
      const link = await this.prisma.documentSponsor.findFirst({
        where: { documentId, sponsorId, status: true },
        select: { id: true },
      });
      if (!link) return null;

      const userDoc = await this.prisma.userDocuments.findFirst({
        where: { procesoId, documentSponsorId: link.id },
        select: { id: true },
      });
      return userDoc?.id ?? null;
    }

    const userDoc = await this.prisma.userDocuments.findFirst({
      where: { procesoId, documentId },
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
