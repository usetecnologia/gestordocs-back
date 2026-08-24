import type { UserGetPayload, PersonModel } from 'prisma/generated/prisma/models';
import { User } from '../../domain/user.entity';
import { UserStatus } from '../../domain/user.enums';

export const USER_INCLUDE = {
  role: { select: { id: true, name: true, code: true } },
  country: { select: { id: true, name: true, code: true } },
  sponsor: { select: { id: true, name: true, code: true } },
  program: { select: { id: true, name: true, code: true } },
  optionProgram: { select: { id: true, shortDatabase: true } },
  procesoVisible: {
    select: {
      id: true,
      estado: true,
      statusDocumental: true,
      fechaIngreso: true,
      finalizadoAt: true,
    },
  },
} as const;

export const USER_DETAIL_INCLUDE = {
  ...USER_INCLUDE,
  userObservations: {
    include: {
      userObservationEtiquetas: {
        include: { etiquetas: { select: { id: true, name: true } } },
      },
      userObservationFiles: {
        select: { id: true, file: true },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  userHistories: {
    orderBy: { createdAt: 'desc' as const },
  },
  emailLogs: {
    orderBy: { sentAt: 'desc' as const },
  },
} as const;

export const USER_LIST_INCLUDE = {
  ...USER_INCLUDE,
  userHistories: {
    orderBy: { createdAt: 'desc' as const },
  },
  emailLogs: {
    orderBy: { sentAt: 'desc' as const },
  },
} as const;

export type PrismaUserFull = UserGetPayload<{
  include: typeof USER_INCLUDE;
}>;

export type PrismaUserDetail = UserGetPayload<{
  include: typeof USER_DETAIL_INCLUDE;
}>;

export type PrismaUserList = UserGetPayload<{
  include: typeof USER_LIST_INCLUDE;
}>;

/**
 * Deja solo lo que pertenece al **ciclo visible**. Sirve para el historial de estados y para las
 * observaciones: las dos cosas cuelgan de un proceso, y un ciclo nuevo arranca limpio.
 *
 * Lo del ciclo anterior sigue existiendo colgado de su proceso — no se borra nada, solo deja de
 * mostrarse en un ciclo que no es el suyo.
 *
 * Un registro sin proceso no pertenece a ningún ciclo y no aparece. En la práctica no quedan: las
 * entradas de historial del alta —anteriores al primer proceso— las adopta `crearProcesoAbierto`
 * al abrirlo.
 */
function historialDelCiclo<T extends { procesoId: string | null }>(
  historial: readonly T[],
  procesoVisibleId: string | null,
): T[] {
  return historial.filter((h) => h.procesoId !== null && h.procesoId === procesoVisibleId);
}

/**
 * Historial de correos **del ciclo visible**. Un ciclo nuevo arranca sin historial: los correos del
 * anterior siguen existiendo colgados de su proceso, pero no se muestran acá.
 *
 * El filtro va en el mapeo y no en el `include` porque Prisma no puede comparar un include contra
 * una columna de la fila padre. Un correo sin proceso —los registros a nivel de plantilla, sin
 * destinatario— no pertenece a ningún ciclo y no aparece.
 */
function mapEmailLogs(
  emailLogs: PrismaUserList['emailLogs'],
  procesoVisibleId: string | null,
) {
  return emailLogs
    .filter((log) => log.procesoId !== null && log.procesoId === procesoVisibleId)
    .map((log) => ({
    id: log.id,
    actionCode: log.actionCode,
    templateCode: log.templateCode,
    subject: log.subject,
    status: log.status as string,
    source: log.source as string,
      errorMessage: log.errorMessage,
      sentAt: log.sentAt,
    }));
}

/**
 * Ciclo al que corresponde una fila del listado. Se pasa aparte y no se deduce del usuario porque en
 * el listado por proceso una misma persona aparece varias veces, cada vez con un ciclo distinto.
 */
export interface CicloDeLaFila {
  id: string;
  estado: string;
  statusDocumental: string;
  fechaIngreso: Date;
  finalizadoAt: Date | null;
  esVisible: boolean;
}

export class UserMapper {
  static toDomain(user: PrismaUserFull, person: PersonModel | null): User {
    return new User(
      user.id,
      person?.firstname ?? '',
      person?.middlename ?? null,
      person?.lastfathername ?? '',
      person?.lastmothername ?? null,
      person?.birthdate ?? null,
      person?.phone ?? null,
      person?.avatar ?? null,
      user.username,
      user.email,
      user.password,
      user.roleId,
      user.countryId,
      user.sponsorId,
      user.programId,
      user.optionProgramId,
      user.status as unknown as UserStatus,
      user.statusSolRetiro ?? null,
      user.fechadeenvioalsponsor ?? null,
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
      user.procesoVisible ?? null,
    );
  }

  /**
   * `ciclo` es el proceso de esta fila. Cuando viene, el historial de estados, las observaciones y
   * los correos se filtran por **ese** ciclo y no por el visible: la fila de un ciclo archivado tiene
   * que mostrar lo que pasó en él, no lo que pasa en el ciclo en curso.
   */
  static toListDomain(
    user: PrismaUserList,
    person: PersonModel | null,
    creatorPersonMap: Map<string, string> = new Map(),
    ciclo: CicloDeLaFila | null = null,
  ): User {
    const cicloId = ciclo?.id ?? user.procesoVisibleId;
    return new User(
      user.id,
      person?.firstname ?? '',
      person?.middlename ?? null,
      person?.lastfathername ?? '',
      person?.lastmothername ?? null,
      person?.birthdate ?? null,
      person?.phone ?? null,
      person?.avatar ?? null,
      user.username,
      user.email,
      user.password,
      user.roleId,
      user.countryId,
      user.sponsorId,
      user.programId,
      user.optionProgramId,
      user.status as unknown as UserStatus,
      user.statusSolRetiro ?? null,
      user.fechadeenvioalsponsor ?? null,
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
      user.procesoVisible ?? null,
      null,
      historialDelCiclo(user.userHistories, cicloId).map((h) => ({
        id: h.id,
        status: h.status as string,
        createdById: h.createdById ?? null,
        createdBy: h.createdById && creatorPersonMap.has(h.createdById)
          ? { id: h.createdById, fullName: creatorPersonMap.get(h.createdById)! }
          : null,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
      })),
      mapEmailLogs(user.emailLogs, cicloId),
      ciclo,
    );
  }

  static toDetailDomain(
    user: PrismaUserDetail,
    person: PersonModel | null,
    creatorPersonMap: Map<string, string> = new Map(),
    ciclo: CicloDeLaFila | null = null,
  ): User {
    // Sin `ciclo` explícito se muestra el ciclo en curso. Con uno, se está mirando un ciclo
    // archivado y todo lo que cuelga de él —documentos, observaciones, correos, historial— se lee
    // de ese ciclo.
    const cicloId = ciclo?.id ?? user.procesoVisibleId;
    return new User(
      user.id,
      person?.firstname ?? '',
      person?.middlename ?? null,
      person?.lastfathername ?? '',
      person?.lastmothername ?? null,
      person?.birthdate ?? null,
      person?.phone ?? null,
      person?.avatar ?? null,
      user.username,
      user.email,
      user.password,
      user.roleId,
      user.countryId,
      user.sponsorId,
      user.programId,
      user.optionProgramId,
      user.status as unknown as UserStatus,
      user.statusSolRetiro ?? null,
      user.fechadeenvioalsponsor ?? null,
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
      user.procesoVisible ?? null,
      historialDelCiclo(user.userObservations, cicloId).map((obs) => ({
        id: obs.id,
        observation: obs.observation,
        status: obs.status,
        endDate: obs.endDate,
        createdAt: obs.createdAt,
        updatedAt: obs.updatedAt,
        createdById: obs.createdById,
        createdBy: obs.createdById && creatorPersonMap.has(obs.createdById)
          ? { id: obs.createdById, fullName: creatorPersonMap.get(obs.createdById)! }
          : null,
        etiquetas: obs.userObservationEtiquetas.map((e) => e.etiquetas),
        files: obs.userObservationFiles.map((f) => ({ id: f.id, file: f.file })),
      })),
      historialDelCiclo(user.userHistories, cicloId).map((h) => ({
        id: h.id,
        status: h.status as string,
        createdById: h.createdById ?? null,
        createdBy: h.createdById && creatorPersonMap.has(h.createdById)
          ? { id: h.createdById, fullName: creatorPersonMap.get(h.createdById)! }
          : null,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
      })),
      mapEmailLogs(user.emailLogs, cicloId),
      ciclo,
    );
  }
}
