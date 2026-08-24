import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from 'prisma/generated/prisma/client';
import { espejarStatusDocumental } from '@modules/proceso/infrastructure/persistence/espejar-status-documental';
import { procesoVisibleDe } from '@modules/proceso/infrastructure/persistence/proceso-del-participante';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IUserRepository,
  UserFilters,
  CreateUserData,
  UpdateUserData,
  CreateObservationData,
  ObservationResult,
  CreateExternalUserData,
  UpdateExternalUserData,
  ExportUsersFilters,
  ExportUserRow,
  UserStatusFunnelFilters,
  UserStatusCount,
  FunnelExportFilters,
  FunnelExportRow,
  PreviousStatusFilters,
  isNoSponsorFilter,
  isWithSponsorFilter,
} from '../../domain/user.repository';
import { User } from '../../domain/user.entity';
import { UserStatus } from '../../domain/user.enums';
import {
  UserMapper,
  USER_INCLUDE,
  USER_DETAIL_INCLUDE,
  USER_LIST_INCLUDE,
  PrismaUserFull,
  PrismaUserDetail,
  PrismaUserList,
  type CicloDeLaFila,
} from './user.mapper';
import type { PersonModel } from 'prisma/generated/prisma/models';

const PERSON_FIELD_KEYS = [
  'firstname',
  'middlename',
  'lastfathername',
  'lastmothername',
  'birthdate',
  'phone',
  'avatar',
] as const;

const USER_FIELD_KEYS = [
  'username',
  'email',
  'password',
  'roleId',
  'countryId',
  'sponsorId',
  'programId',
  'optionProgramId',
  'status',
] as const;

/**
 * Ciclo que muestra el detalle: el que se pidió por URL o, si no se pidió ninguno, el visible del
 * participante. `esVisible` es lo que le dice a la pantalla si admite acciones — un ciclo que no es
 * el visible está archivado y está congelado.
 */
function cicloDelDetalle(
  user: PrismaUserDetail,
  pedido: {
    id: string;
    estado: string;
    statusDocumental: string;
    fechaIngreso: Date;
    finalizadoAt: Date | null;
  } | null,
): CicloDeLaFila | null {
  const ciclo = pedido ?? user.procesoVisible;
  if (!ciclo) return null;
  return { ...ciclo, esVisible: ciclo.id === user.procesoVisibleId };
}

@Injectable()
export class UserPrismaRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // SIN_SPONSOR / CON_SPONSOR / uuid — misma interpretación en todos los filtros por sponsor
  // de los reportes (funnel, tabla y Excel), tanto en where de Prisma como en SQL crudo.
  private sponsorWhereFragment(sponsorId?: string): { sponsorId?: string | null | { not: null } } {
    if (!sponsorId) return {};
    if (isNoSponsorFilter(sponsorId)) return { sponsorId: null };
    if (isWithSponsorFilter(sponsorId)) return { sponsorId: { not: null } };
    return { sponsorId };
  }

  private sponsorSqlCondition(sponsorId?: string): Prisma.Sql | undefined {
    if (!sponsorId) return undefined;
    if (isNoSponsorFilter(sponsorId)) return Prisma.sql`u.sponsorId IS NULL`;
    if (isWithSponsorFilter(sponsorId)) return Prisma.sql`u.sponsorId IS NOT NULL`;
    return Prisma.sql`u.sponsorId = ${sponsorId}`;
  }

  // SI = tiene fecha de envío al sponsor (fechadeenvioalsponsor con valor). NO = vacío/nulo.
  // Todos los flujos de escritura (autologin, bulk-load, updateByDni) normalizan el campo con
  // `|| null`, así que nunca queda un string vacío guardado — solo se necesita chequear null.
  private fechaEnvioSponsorWhereFragment(
    value: 'SI' | 'NO' | undefined,
  ): { fechadeenvioalsponsor?: null | { not: null } } {
    if (value === 'SI') return { fechadeenvioalsponsor: { not: null } };
    if (value === 'NO') return { fechadeenvioalsponsor: null };
    return {};
  }

  // `status` (estado exacto) y `generalStatus` (ACTIVO/INACTIVO) filtran el mismo campo de Prisma
  // — no se pueden mezclar en un solo spread de objeto porque la clave repetida se pisa. Se
  // combinan siempre con AND: si ambos vienen, deben cumplirse los dos a la vez.
  private statusWhereFragment(
    status: UserStatus | undefined,
    generalStatus: 'ACTIVO' | 'INACTIVO' | undefined,
  ): Prisma.UserWhereInput {
    const conditions: Prisma.UserWhereInput[] = [];
    if (status) conditions.push({ status });
    if (generalStatus === 'INACTIVO') conditions.push({ status: 'INACTIVO' as never });
    if (generalStatus === 'ACTIVO') conditions.push({ status: { not: 'INACTIVO' as never } });

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /**
   * Filtros que se resuelven a una lista de ids de participante: la búsqueda por texto, la
   * solicitud de retiro y el rango de fechas del historial de estados. Devuelve `undefined` cuando
   * ninguno de esos filtros vino, y un array —posiblemente vacío— cuando sí.
   */
  private async resolveParticipantIdFilters({
    search,
    statusSolRetiro,
    status,
    createdFrom,
    createdTo,
    filterIds,
  }: {
    search?: string;
    statusSolRetiro?: string;
    status?: UserStatus;
    createdFrom?: Date;
    createdTo?: Date;
    filterIds?: string[];
  }): Promise<string[] | undefined> {
    let searchIds: string[] | undefined;
    if (search) {
      const terms = search.split(/[\s+]+/).map((t) => t.trim()).filter(Boolean);
      const conditions = terms.flatMap((t) => {
        const like = `%${t.toLowerCase()}%`;
        return [
          Prisma.sql`LOWER(u.email) LIKE ${like}`,
          Prisma.sql`LOWER(u.username) LIKE ${like}`,
          Prisma.sql`LOWER(p.dni) LIKE ${like}`,
          Prisma.sql`LOWER(p.firstname) LIKE ${like}`,
          Prisma.sql`LOWER(p.middlename) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastfathername) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastmothername) LIKE ${like}`,
        ];
      });
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT DISTINCT u.id
          FROM \`User\` u
          LEFT JOIN \`Person\` p ON p.id = u.id
          WHERE ${Prisma.join(conditions, ' OR ')}
        `,
      );
      searchIds = rows.map((r) => r.id);
    }

    let statusSolRetiroIds: string[] | undefined;
    if (statusSolRetiro) {
      const normalized = statusSolRetiro.trim().toUpperCase();
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM \`User\` WHERE UPPER(TRIM(statusSolRetiro)) = ${normalized}`,
      );
      statusSolRetiroIds = rows.map((r) => r.id);
    }

    const historyDateIds =
      status && (createdFrom || createdTo)
        ? await this.findStatusEntryDateIds(status, createdFrom, createdTo)
        : undefined;

    const idFilters = [searchIds, statusSolRetiroIds, historyDateIds, filterIds].filter(
      (ids): ids is string[] => ids !== undefined,
    );
    return idFilters.length
      ? idFilters.reduce((acc, ids) => acc.filter((id) => ids.includes(id)))
      : undefined;
  }

  /** El mismo criterio de `statusWhereFragment`, aplicado al estado documental del proceso. */
  private statusDocumentalWhereFragment(
    status: UserStatus | undefined,
    generalStatus: 'ACTIVO' | 'INACTIVO' | undefined,
  ): Prisma.ProcesoWhereInput {
    const conditions: Prisma.ProcesoWhereInput[] = [];
    if (status) conditions.push({ statusDocumental: status as never });
    if (generalStatus === 'INACTIVO') conditions.push({ statusDocumental: 'INACTIVO' as never });
    if (generalStatus === 'ACTIVO') {
      conditions.push({ statusDocumental: { not: 'INACTIVO' as never } });
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { AND: conditions };
  }

  /** Nombres de quienes crearon las entradas de historial, para el mapeo. */
  private async buildHistoryCreatorMap(
    users: { userHistories: { createdById: string | null }[] }[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(
        users
          .flatMap((u) => u.userHistories.map((h) => h.createdById))
          .filter((id): id is string => id !== null),
      ),
    ];
    if (ids.length === 0) return new Map();

    const personas = await this.prisma.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
    });
    return new Map(
      personas.map((p) => [
        p.id,
        [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' '),
      ]),
    );
  }

  /**
   * Igual que `findAll` pero **una fila por proceso**: un participante con dos ciclos devuelve dos
   * filas, cada una con su propio ciclo. Es el listado que ve USE.
   *
   * Los filtros se reparten según a quién pertenece el dato:
   *
   * - **Del ciclo** —estado documental, sponsor, programa, opción, país— se aplican al proceso de la
   *   fila. Filtrar "sponsor = CIEE" devuelve los ciclos cuyo sponsor fue CIEE, no los participantes
   *   que hoy lo tienen.
   * - **Del participante** —búsqueda por nombre o DNI, solicitud de retiro, fecha de envío al
   *   sponsor, rango de fechas— se aplican a la persona, y traen todos sus ciclos que además
   *   cumplan los filtros de ciclo.
   *
   * No reemplaza a `findAll`: el dashboard lo usa para contar participantes por estado, y ahí una
   * persona con dos ciclos contaría doble.
   */
  async findAllByProceso({
    page,
    limit,
    status,
    roleId,
    countryId,
    sponsorId,
    hasSponsor,
    programId,
    optionProgramId,
    statusSolRetiro,
    generalStatus,
    fechaEnvioSponsor,
    procesoEstado,
    search,
    sortBy,
    sortOrder,
    createdFrom,
    createdTo,
    ids: filterIds,
  }: UserFilters) {
    const combinedIds = await this.resolveParticipantIdFilters({
      search,
      statusSolRetiro,
      status,
      createdFrom,
      createdTo,
      filterIds,
    });

    // Un `in` vacío no matchea nada: si algún filtro de participante no dejó a nadie, se corta acá.
    if (combinedIds !== undefined && combinedIds.length === 0) return { data: [], total: 0 };

    const whereProceso: Prisma.ProcesoWhereInput = {
      ...(procesoEstado && { estado: procesoEstado }),
      ...this.statusDocumentalWhereFragment(status, generalStatus),
      ...(countryId && { countryId }),
      ...this.sponsorWhereFragment(sponsorId),
      ...(hasSponsor === true && { sponsorId: { not: null } }),
      ...(hasSponsor === false && { sponsorId: null }),
      ...(programId && { programId }),
      ...(optionProgramId && { optionProgramId }),
      participante: {
        ...(roleId && { roleId }),
        ...this.fechaEnvioSponsorWhereFragment(fechaEnvioSponsor),
        ...(combinedIds !== undefined && { id: { in: combinedIds } }),
      },
    };

    const include = { participante: { include: USER_LIST_INCLUDE } } as const;
    type FilaProceso = Prisma.ProcesoGetPayload<{ include: typeof include }>;

    let filas: FilaProceso[];
    let total: number;

    if (sortBy) {
      // firstname/lastfathername viven en Person, sin relación Prisma, así que el orden y la
      // paginación se resuelven en memoria — igual que en `findAll`, pero sobre filas de proceso.
      const candidatas = await this.prisma.proceso.findMany({
        where: whereProceso,
        select: { id: true, participanteId: true, fechaIngreso: true },
      });

      const personIds = [...new Set(candidatas.map((p) => p.participanteId))];
      const personas = personIds.length
        ? await this.prisma.person.findMany({
            where: { id: { in: personIds } },
            select: { id: true, firstname: true, lastfathername: true },
          })
        : [];
      const valorPorPersona = new Map<string, string>(
        personas.map((p) => [p.id, (sortBy === 'firstname' ? p.firstname : p.lastfathername) ?? '']),
      );

      const direccion = sortOrder === 'desc' ? -1 : 1;
      const ordenadas = [...candidatas].sort((a, b) => {
        const va = valorPorPersona.get(a.participanteId) ?? '';
        const vb = valorPorPersona.get(b.participanteId) ?? '';
        const porNombre = direccion * va.localeCompare(vb, 'es', { sensitivity: 'base' });
        // Los ciclos de una misma persona quedan juntos, del más reciente al más antiguo.
        return porNombre !== 0 ? porNombre : b.fechaIngreso.getTime() - a.fechaIngreso.getTime();
      });

      total = ordenadas.length;
      const idsPagina = ordenadas.slice((page - 1) * limit, (page - 1) * limit + limit).map((p) => p.id);

      const sinOrden = idsPagina.length
        ? await this.prisma.proceso.findMany({ where: { id: { in: idsPagina } }, include })
        : [];
      const porId = new Map(sinOrden.map((f) => [f.id, f]));
      filas = idsPagina.map((id) => porId.get(id)).filter((f): f is FilaProceso => !!f);
    } else {
      const [filasRaw, totalCount] = await this.prisma.$transaction([
        this.prisma.proceso.findMany({
          where: whereProceso,
          include,
          skip: (page - 1) * limit,
          take: limit,
          // Se conserva el orden por antigüedad del participante que ya tenía el listado, y los
          // ciclos de cada uno quedan juntos con el más reciente arriba.
          orderBy: [{ participante: { createdAt: 'desc' } }, { fechaIngreso: 'desc' }],
        }),
        this.prisma.proceso.count({ where: whereProceso }),
      ]);
      filas = filasRaw;
      total = totalCount;
    }

    const userIds = [...new Set(filas.map((f) => f.participanteId))];
    const persons: PersonModel[] = userIds.length
      ? await this.prisma.person.findMany({ where: { id: { in: userIds } } })
      : [];
    const personMap = new Map<string, PersonModel>(persons.map((p) => [p.id, p]));
    const creatorPersonMap = await this.buildHistoryCreatorMap(
      filas.map((f) => f.participante),
    );

    return {
      data: filas.map((f) =>
        UserMapper.toListDomain(
          f.participante,
          personMap.get(f.participanteId) ?? null,
          creatorPersonMap,
          {
            id: f.id,
            estado: f.estado,
            statusDocumental: f.statusDocumental,
            fechaIngreso: f.fechaIngreso,
            finalizadoAt: f.finalizadoAt,
            esVisible: f.id === f.participante.procesoVisibleId,
          },
        ),
      ),
      total,
    };
  }

  async findAll({
    page,
    limit,
    status,
    roleId,
    countryId,
    sponsorId,
    hasSponsor,
    programId,
    optionProgramId,
    statusSolRetiro,
    generalStatus,
    fechaEnvioSponsor,
    search,
    sortBy,
    sortOrder,
    createdFrom,
    createdTo,
    ids: filterIds,
  }: UserFilters) {
    let searchIds: string[] | undefined;
    if (search) {
      const terms = search.split(/[\s+]+/).map((t) => t.trim()).filter(Boolean);
      const conditions = terms.flatMap((t) => {
        const like = `%${t.toLowerCase()}%`;
        return [
          Prisma.sql`LOWER(u.email) LIKE ${like}`,
          Prisma.sql`LOWER(u.username) LIKE ${like}`,
          Prisma.sql`LOWER(p.dni) LIKE ${like}`,
          Prisma.sql`LOWER(p.firstname) LIKE ${like}`,
          Prisma.sql`LOWER(p.middlename) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastfathername) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastmothername) LIKE ${like}`,
        ];
      });
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT DISTINCT u.id
          FROM \`User\` u
          LEFT JOIN \`Person\` p ON p.id = u.id
          WHERE ${Prisma.join(conditions, ' OR ')}
        `,
      );
      searchIds = rows.map((r) => r.id);
    }

    let statusSolRetiroIds: string[] | undefined;
    if (statusSolRetiro) {
      const normalized = statusSolRetiro.trim().toUpperCase();
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM \`User\` WHERE UPPER(TRIM(statusSolRetiro)) = ${normalized}`,
      );
      statusSolRetiroIds = rows.map((r) => r.id);
    }

    const historyDateIds =
      status && (createdFrom || createdTo)
        ? await this.findStatusEntryDateIds(status, createdFrom, createdTo)
        : undefined;

    const idFilters = [searchIds, statusSolRetiroIds, historyDateIds, filterIds].filter(
      (ids): ids is string[] => ids !== undefined,
    );
    const combinedIds = idFilters.length
      ? idFilters.reduce((acc, ids) => acc.filter((id) => ids.includes(id)))
      : undefined;

    const where = {
      ...this.statusWhereFragment(status, generalStatus),
      ...(roleId && { roleId }),
      ...(countryId && { countryId }),
      ...this.sponsorWhereFragment(sponsorId),
      ...(hasSponsor === true && { sponsorId: { not: null } }),
      ...(hasSponsor === false && { sponsorId: null }),
      ...(programId && { programId }),
      ...(optionProgramId && { optionProgramId }),
      ...this.fechaEnvioSponsorWhereFragment(fechaEnvioSponsor),
      ...(combinedIds !== undefined && { id: { in: combinedIds } }),
    };

    let users: PrismaUserList[];
    let total: number;

    if (sortBy) {
      // firstname/lastfathername viven en Person, sin relación Prisma con User,
      // así que el orden y la paginación se resuelven en memoria sobre los ids.
      const matchingIds = (
        await this.prisma.user.findMany({ where, select: { id: true } })
      ).map((u) => u.id);

      const sortPersons = matchingIds.length
        ? await this.prisma.person.findMany({
            where: { id: { in: matchingIds } },
            select: { id: true, firstname: true, lastfathername: true },
          })
        : [];
      const sortValueMap = new Map<string, string>(
        sortPersons.map((p) => [p.id, (sortBy === 'firstname' ? p.firstname : p.lastfathername) ?? '']),
      );

      const direction = sortOrder === 'desc' ? -1 : 1;
      const sortedIds = [...matchingIds].sort((a, b) => {
        const va = sortValueMap.get(a) ?? '';
        const vb = sortValueMap.get(b) ?? '';
        return direction * va.localeCompare(vb, 'es', { sensitivity: 'base' });
      });

      total = sortedIds.length;
      const pageIds = sortedIds.slice((page - 1) * limit, (page - 1) * limit + limit);

      const pageUsersRaw = pageIds.length
        ? await this.prisma.user.findMany({ where: { id: { in: pageIds } }, include: USER_LIST_INCLUDE })
        : [];
      const byId = new Map((pageUsersRaw as PrismaUserList[]).map((u) => [u.id, u]));
      users = pageIds.map((id) => byId.get(id)).filter((u): u is PrismaUserList => !!u);
    } else {
      const [usersRaw, totalCount] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          include: USER_LIST_INCLUDE,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);
      users = usersRaw as PrismaUserList[];
      total = totalCount;
    }

    const userIds = users.map((u) => u.id);
    const persons: PersonModel[] = userIds.length
      ? await this.prisma.person.findMany({ where: { id: { in: userIds } } })
      : [];
    const personMap = new Map<string, PersonModel>(persons.map((p) => [p.id, p]));

    const historyCreatorIds = [
      ...new Set(
        users.flatMap((u) => u.userHistories.map((h) => h.createdById)).filter((id): id is string => id !== null),
      ),
    ];
    const historyCreatorPersons = historyCreatorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: historyCreatorIds } },
          select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
        })
      : [];
    const creatorPersonMap = new Map<string, string>(
      historyCreatorPersons.map((p) => [
        p.id,
        [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' '),
      ]),
    );

    return {
      data: users.map((u) => UserMapper.toListDomain(u, personMap.get(u.id) ?? null, creatorPersonMap)),
      total,
    };
  }

  async findAllStaff({
    page,
    limit,
    status,
    roleId,
    countryId,
    sponsorId,
    programId,
    optionProgramId,
    search,
  }: UserFilters) {
    let searchIds: string[] | undefined;
    if (search) {
      const terms = search.split(/[\s+]+/).map((t) => t.trim()).filter(Boolean);
      const conditions = terms.flatMap((t) => {
        const like = `%${t.toLowerCase()}%`;
        return [
          Prisma.sql`LOWER(u.email) LIKE ${like}`,
          Prisma.sql`LOWER(u.username) LIKE ${like}`,
          Prisma.sql`LOWER(p.dni) LIKE ${like}`,
          Prisma.sql`LOWER(p.firstname) LIKE ${like}`,
          Prisma.sql`LOWER(p.middlename) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastfathername) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastmothername) LIKE ${like}`,
        ];
      });
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT DISTINCT u.id
          FROM \`User\` u
          LEFT JOIN \`Person\` p ON p.id = u.id
          WHERE ${Prisma.join(conditions, ' OR ')}
        `,
      );
      searchIds = rows.map((r) => r.id);
    }

    const where = {
      role: { name: { not: 'Participante' } },
      ...(status && { status }),
      ...(roleId && { roleId }),
      ...(countryId && { countryId }),
      ...(sponsorId && { sponsorId }),
      ...(programId && { programId }),
      ...(optionProgramId && { optionProgramId }),
      ...(searchIds !== undefined && { id: { in: searchIds } }),
    };

    const [usersRaw, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    const users = usersRaw as PrismaUserFull[];
    const userIds = users.map((u) => u.id);
    const persons: PersonModel[] = userIds.length
      ? await this.prisma.person.findMany({ where: { id: { in: userIds } } })
      : [];
    const personMap = new Map<string, PersonModel>(persons.map((p) => [p.id, p]));

    return {
      data: users.map((u) => UserMapper.toDomain(u, personMap.get(u.id) ?? null)),
      total,
    };
  }

  async countByStatus(
    statuses: UserStatus[],
    { sponsorId, programId, countryId, createdFrom, createdTo, generalStatus }: UserStatusFunnelFilters,
  ): Promise<UserStatusCount[]> {
    // INACTIVO no es un status del funnel — en vez de dar 0 en todo, se reasigna cada
    // participante inactivo al estado que tenía justo ANTES de pasar a INACTIVO.
    if (generalStatus === 'INACTIVO') {
      return this.countByPreviousStatusBeforeInactive(statuses, {
        sponsorId,
        programId,
        countryId,
        createdFrom,
        createdTo,
      });
    }

    // El rango de fecha filtra por cuándo cada participante entró a su status ACTUAL
    // (última fila de UserHistoryStatus con ese status), no por su fecha de alta.
    // Si nunca tuvo un cambio de estado registrado, se usa User.created_at como respaldo.
    const conditions: Prisma.Sql[] = [
      Prisma.sql`u.status IN (${Prisma.join(statuses.map((s) => Prisma.sql`${s}`))})`,
    ];
    const sponsorCondition = this.sponsorSqlCondition(sponsorId);
    if (sponsorCondition) conditions.push(sponsorCondition);
    if (programId) conditions.push(Prisma.sql`u.programId = ${programId}`);
    if (countryId) conditions.push(Prisma.sql`u.countryId = ${countryId}`);
    if (createdFrom) conditions.push(Prisma.sql`COALESCE(h.enteredAt, u.created_at) >= ${createdFrom}`);
    if (createdTo) conditions.push(Prisma.sql`COALESCE(h.enteredAt, u.created_at) <= ${createdTo}`);
    // Mismo criterio que /users: ACTIVO = cualquier status excepto INACTIVO (aquí es un no-op,
    // ya que ningún status del funnel es INACTIVO).
    if (generalStatus === 'ACTIVO') conditions.push(Prisma.sql`u.status != ${'INACTIVO'}`);

    const rows = await this.prisma.$queryRaw<{ status: string; count: bigint | number }[]>(
      Prisma.sql`
        SELECT u.status AS status, COUNT(*) AS count
        FROM \`User\` u
        LEFT JOIN (
          SELECT userId, status, MAX(created_at) AS enteredAt
          FROM \`UserHistoryStatus\`
          GROUP BY userId, status
        ) h ON h.userId = u.id AND h.status = u.status
        WHERE ${Prisma.join(conditions, ' AND ')}
        GROUP BY u.status
      `,
    );

    const counts = new Map(rows.map((r) => [r.status as UserStatus, Number(r.count)]));
    return statuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }

  // Para cada participante ACTUALMENTE inactivo, busca la última fila de UserHistoryStatus con
  // status = INACTIVO (cuándo se inactivó) y la fila inmediatamente anterior a esa (su estado
  // previo). Cuenta por ese estado previo. Un participante sin ninguna fila anterior (nunca tuvo
  // otro estado registrado) queda fuera del conteo, ya que no hay un estado previo que atribuirle.
  private async countByPreviousStatusBeforeInactive(
    statuses: UserStatus[],
    {
      sponsorId,
      programId,
      countryId,
      createdFrom,
      createdTo,
    }: Omit<UserStatusFunnelFilters, 'generalStatus'>,
  ): Promise<UserStatusCount[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`prev.status IN (${Prisma.join(statuses.map((s) => Prisma.sql`${s}`))})`,
    ];
    const sponsorCondition = this.sponsorSqlCondition(sponsorId);
    if (sponsorCondition) conditions.push(sponsorCondition);
    if (programId) conditions.push(Prisma.sql`u.programId = ${programId}`);
    if (countryId) conditions.push(Prisma.sql`u.countryId = ${countryId}`);
    // El rango de fecha filtra por cuándo el participante se volvió INACTIVO.
    if (createdFrom) conditions.push(Prisma.sql`cur.created_at >= ${createdFrom}`);
    if (createdTo) conditions.push(Prisma.sql`cur.created_at <= ${createdTo}`);

    const rows = await this.prisma.$queryRaw<{ status: string; count: bigint | number }[]>(
      Prisma.sql`
        SELECT prev.status AS status, COUNT(*) AS count
        FROM \`User\` u
        JOIN \`UserHistoryStatus\` cur
          ON cur.userId = u.id
          AND cur.status = 'INACTIVO'
          AND cur.created_at = (
            SELECT MAX(created_at) FROM \`UserHistoryStatus\` WHERE userId = u.id AND status = 'INACTIVO'
          )
        JOIN \`UserHistoryStatus\` prev
          ON prev.userId = u.id
          AND prev.status != 'INACTIVO'
          AND prev.created_at = (
            SELECT MAX(created_at) FROM \`UserHistoryStatus\`
            WHERE userId = u.id AND status != 'INACTIVO' AND created_at < cur.created_at
          )
        WHERE u.status = 'INACTIVO'
          AND ${Prisma.join(conditions, ' AND ')}
        GROUP BY prev.status
      `,
    );

    const counts = new Map(rows.map((r) => [r.status as UserStatus, Number(r.count)]));
    return statuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
  }

  // Ids de los participantes ACTUALMENTE inactivos cuyo estado ANTERIOR (justo antes de pasar
  // a INACTIVO) coincide con `status`. Misma regla que countByPreviousStatusBeforeInactive, pero
  // para un único status — usado por la tabla y el Excel del funnel.
  async findInactiveIdsByPreviousStatus(
    status: UserStatus,
    { sponsorId, programId, countryId, createdFrom, createdTo }: PreviousStatusFilters,
  ): Promise<string[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`prev.status = ${status}`];
    const sponsorCondition = this.sponsorSqlCondition(sponsorId);
    if (sponsorCondition) conditions.push(sponsorCondition);
    if (programId) conditions.push(Prisma.sql`u.programId = ${programId}`);
    if (countryId) conditions.push(Prisma.sql`u.countryId = ${countryId}`);
    if (createdFrom) conditions.push(Prisma.sql`cur.created_at >= ${createdFrom}`);
    if (createdTo) conditions.push(Prisma.sql`cur.created_at <= ${createdTo}`);

    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT u.id
        FROM \`User\` u
        JOIN \`UserHistoryStatus\` cur
          ON cur.userId = u.id
          AND cur.status = 'INACTIVO'
          AND cur.created_at = (
            SELECT MAX(created_at) FROM \`UserHistoryStatus\` WHERE userId = u.id AND status = 'INACTIVO'
          )
        JOIN \`UserHistoryStatus\` prev
          ON prev.userId = u.id
          AND prev.status != 'INACTIVO'
          AND prev.created_at = (
            SELECT MAX(created_at) FROM \`UserHistoryStatus\`
            WHERE userId = u.id AND status != 'INACTIVO' AND created_at < cur.created_at
          )
        WHERE u.status = 'INACTIVO'
          AND ${Prisma.join(conditions, ' AND ')}
      `,
    );
    return rows.map((r) => r.id);
  }

  async findAllForFunnelExport({
    status,
    sponsorId,
    programId,
    countryId,
    createdFrom,
    createdTo,
    generalStatus,
  }: FunnelExportFilters): Promise<FunnelExportRow[]> {
    if (generalStatus === 'INACTIVO') {
      const ids = await this.findInactiveIdsByPreviousStatus(status, {
        sponsorId,
        programId,
        countryId,
        createdFrom,
        createdTo,
      });
      return this.fetchFunnelExportRows({ status: 'INACTIVO' as never, id: { in: ids } });
    }

    const historyDateIds =
      createdFrom || createdTo ? await this.findStatusEntryDateIds(status, createdFrom, createdTo) : undefined;

    const where = {
      ...this.statusWhereFragment(status, generalStatus),
      ...this.sponsorWhereFragment(sponsorId),
      ...(programId && { programId }),
      ...(countryId && { countryId }),
      ...(historyDateIds !== undefined && { id: { in: historyDateIds } }),
    };

    return this.fetchFunnelExportRows(where);
  }

  private async fetchFunnelExportRows(where: Prisma.UserWhereInput): Promise<FunnelExportRow[]> {
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        statusSolRetiro: true,
        status: true,
        country: { select: { name: true } },
        sponsor: { select: { name: true } },
        program: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = users.map((u) => u.id);
    const persons = userIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: userIds } },
          select: { id: true, dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
        })
      : [];
    const personMap = new Map(persons.map((p) => [p.id, p]));

    return users.map((u) => {
      const person = personMap.get(u.id);
      return {
        dni: person?.dni ?? null,
        lastname: [person?.lastfathername, person?.lastmothername].filter(Boolean).join(' '),
        firstname: [person?.firstname, person?.middlename].filter(Boolean).join(' '),
        program: u.program?.name ?? null,
        country: u.country?.name ?? null,
        sponsor: u.sponsor?.name ?? null,
        email: u.email,
        statusSolRetiro: u.statusSolRetiro,
        status: u.status as unknown as UserStatus,
      };
    });
  }

  // El rango de fecha filtra por cuándo el participante entró al `status` dado
  // (última fila de UserHistoryStatus con ese status), no por su fecha de alta.
  // Si nunca tuvo un cambio de estado registrado, se usa User.created_at como respaldo.
  private async findStatusEntryDateIds(
    status: UserStatus,
    createdFrom?: Date,
    createdTo?: Date,
  ): Promise<string[]> {
    const dateConditions: Prisma.Sql[] = [];
    if (createdFrom) dateConditions.push(Prisma.sql`COALESCE(h.enteredAt, u.created_at) >= ${createdFrom}`);
    if (createdTo) dateConditions.push(Prisma.sql`COALESCE(h.enteredAt, u.created_at) <= ${createdTo}`);

    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT u.id
        FROM \`User\` u
        LEFT JOIN (
          SELECT userId, MAX(created_at) AS enteredAt
          FROM \`UserHistoryStatus\`
          WHERE status = ${status}
          GROUP BY userId
        ) h ON h.userId = u.id
        WHERE u.status = ${status}
          AND ${Prisma.join(dateConditions, ' AND ')}
      `,
    );
    return rows.map((r) => r.id);
  }

  async findAllForExport({
    status,
    roleId,
    countryId,
    sponsorId,
    hasSponsor,
    programId,
    optionProgramId,
    statusSolRetiro,
    generalStatus,
    search,
    sortBy,
    sortOrder,
  }: ExportUsersFilters): Promise<ExportUserRow[]> {
    let searchIds: string[] | undefined;
    if (search) {
      const terms = search.split(/[\s+]+/).map((t) => t.trim()).filter(Boolean);
      const conditions = terms.flatMap((t) => {
        const like = `%${t.toLowerCase()}%`;
        return [
          Prisma.sql`LOWER(u.email) LIKE ${like}`,
          Prisma.sql`LOWER(u.username) LIKE ${like}`,
          Prisma.sql`LOWER(p.dni) LIKE ${like}`,
          Prisma.sql`LOWER(p.firstname) LIKE ${like}`,
          Prisma.sql`LOWER(p.middlename) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastfathername) LIKE ${like}`,
          Prisma.sql`LOWER(p.lastmothername) LIKE ${like}`,
        ];
      });
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT DISTINCT u.id
          FROM \`User\` u
          LEFT JOIN \`Person\` p ON p.id = u.id
          WHERE ${Prisma.join(conditions, ' OR ')}
        `,
      );
      searchIds = rows.map((r) => r.id);
    }

    let statusSolRetiroIds: string[] | undefined;
    if (statusSolRetiro) {
      const normalized = statusSolRetiro.trim().toUpperCase();
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM \`User\` WHERE UPPER(TRIM(statusSolRetiro)) = ${normalized}`,
      );
      statusSolRetiroIds = rows.map((r) => r.id);
    }

    const idFilters = [searchIds, statusSolRetiroIds].filter(
      (ids): ids is string[] => ids !== undefined,
    );
    const combinedIds = idFilters.length
      ? idFilters.reduce((acc, ids) => acc.filter((id) => ids.includes(id)))
      : undefined;

    const where = {
      ...this.statusWhereFragment(status, generalStatus),
      ...(roleId && { roleId }),
      ...(countryId && { countryId }),
      ...this.sponsorWhereFragment(sponsorId),
      ...(hasSponsor === true && { sponsorId: { not: null } }),
      ...(hasSponsor === false && { sponsorId: null }),
      ...(programId && { programId }),
      ...(optionProgramId && { optionProgramId }),
      ...(combinedIds !== undefined && { id: { in: combinedIds } }),
    };

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        status: true,
        status_hired: true,
        sponsor: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    let userIds = users.map((u) => u.id);
    if (!userIds.length) return [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const persons = await this.prisma.person.findMany({
      where: { id: { in: userIds } },
      select: { id: true, dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
    });
    const personMap = new Map(persons.map((p) => [p.id, p]));

    // firstname/lastfathername viven en Person, sin relación Prisma con User — el orden se resuelve en memoria.
    if (sortBy) {
      const direction = sortOrder === 'desc' ? -1 : 1;
      const sortValue = (id: string) =>
        (sortBy === 'firstname' ? personMap.get(id)?.firstname : personMap.get(id)?.lastfathername) ?? '';
      userIds = [...userIds].sort((a, b) =>
        direction * sortValue(a).localeCompare(sortValue(b), 'es', { sensitivity: 'base' }),
      );
    }

    return userIds.map((id) => {
      const person = personMap.get(id);
      const user = userMap.get(id);
      return {
        id,
        dni: person?.dni ?? null,
        firstname: person?.firstname ?? '',
        middlename: person?.middlename ?? null,
        lastfathername: person?.lastfathername ?? '',
        lastmothername: person?.lastmothername ?? null,
        status_hired: user?.status_hired ?? null,
        sponsor: user?.sponsor?.name ?? null,
        status: user?.status ?? '',
      };
    });
  }

  async findById(id: string, procesoId?: string): Promise<User | null> {
    const [userRaw, person] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id }, include: USER_DETAIL_INCLUDE }),
      this.prisma.person.findUnique({ where: { id } }),
    ]);
    if (!userRaw) return null;

    // El `participanteId` en el where no es decorativo: el id del proceso llega por la URL, y sin
    // esa condición se podría pedir el ciclo de otra persona.
    const cicloPedido = procesoId
      ? await this.prisma.proceso.findFirst({
          where: { id: procesoId, participanteId: id },
          select: {
            id: true,
            estado: true,
            statusDocumental: true,
            fechaIngreso: true,
            finalizadoAt: true,
          },
        })
      : null;

    const u = userRaw as PrismaUserDetail;
    const creatorIds = [...new Set([
      ...u.userObservations.map((obs) => obs.createdById),
      ...u.userHistories.map((h) => h.createdById),
    ].filter((cid): cid is string => cid !== null))];
    const creatorPersons = creatorIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
        })
      : [];
    const creatorPersonMap = new Map<string, string>(
      creatorPersons.map((p) => [
        p.id,
        [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' '),
      ]),
    );

    return UserMapper.toDetailDomain(u, person as PersonModel | null, creatorPersonMap,
      // Sin ciclo pedido se muestra el visible, que es el ciclo en curso salvo que el participante
      // no haya vuelto a entrar después de un cierre. Siempre viene alguno, así que la pantalla
      // nunca queda sin saber si el ciclo está abierto o cerrado.
      cicloDelDetalle(u, cicloPedido),
    );
  }

  async create(data: CreateUserData): Promise<User> {
    const id = randomUUID();
    const { firstname, middlename, lastfathername, lastmothername, birthdate, phone } = data;
    const { username, email, password, roleId, countryId, sponsorId, programId, optionProgramId, status } = data;

    await this.prisma.$transaction([
      this.prisma.person.create({
        data: { id, firstname, middlename, lastfathername, lastmothername, birthdate, phone },
      }),
      this.prisma.user.create({
        data: {
          id,
          username,
          email,
          password,
          roleId,
          countryId,
          sponsorId,
          programId,
          optionProgramId,
          ...(status && { status }),
        },
      }),
    ]);

    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const personData: Record<string, unknown> = {};
    const userData: Record<string, unknown> = {};

    for (const key of PERSON_FIELD_KEYS) {
      if (data[key] !== undefined) personData[key] = data[key];
    }
    for (const key of USER_FIELD_KEYS) {
      if (data[key] !== undefined) userData[key] = data[key];
    }

    if (Object.keys(personData).length > 0) {
      await this.prisma.person.update({ where: { id }, data: personData });
    }
    if (Object.keys(userData).length > 0) {
      // El estado va junto con su espejo en el proceso, en una sola transacción: si se separaran,
      // un fallo intermedio dejaría los dos valores en desacuerdo.
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: userData });
        if (typeof userData.status === 'string') {
          await espejarStatusDocumental(tx, id, userData.status);
        }
      });
    }

    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.delete({ where: { id } }),
      this.prisma.person.delete({ where: { id } }),
    ]);
  }

  async addStatusHistory(userId: string, status: string, createdById?: string): Promise<void> {
    await this.prisma.userHistoryStatus.create({
      data: {
        userId,
        procesoId: await procesoVisibleDe(this.prisma, userId),
        status: status as never,
        createdById,
      },
    });
  }

  async createObservation({ participantId, observation, createdById, etiquetaIds, files }: CreateObservationData): Promise<ObservationResult> {
    // La observación pertenece al ciclo en el que se levanta: cuando ese ciclo se cierre, deja de
    // opinar sobre el estado del siguiente.
    const abierto = await this.prisma.proceso.findFirst({
      where: { participanteId: participantId, activo: true },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const obs = await tx.userObservations.create({
        data: {
          userId: participantId,
          procesoId: abierto?.id ?? null,
          observation,
          createdById,
          ...(etiquetaIds?.length && {
            userObservationEtiquetas: {
              create: etiquetaIds.map((etiquetaId) => ({ etiquetaId })),
            },
          }),
          ...(files?.length && {
            userObservationFiles: {
              create: files.map((file) => ({ file })),
            },
          }),
        },
        include: {
          userObservationEtiquetas: {
            include: { etiquetas: { select: { id: true, name: true } } },
          },
          userObservationFiles: {
            select: { id: true, file: true },
          },
        },
      });

      // Si el participante ya fue enviado al sponsor alguna vez (fechadeenvioalsponsor con algún
      // valor), la observación manual lo deja en OBSERVADO_SPONSOR en vez de OBSERVADO.
      const participant = await tx.user.findUnique({
        where: { id: participantId },
        select: { fechadeenvioalsponsor: true },
      });
      const nuevoEstado = participant?.fechadeenvioalsponsor?.trim() ? 'OBSERVADO_SPONSOR' : 'OBSERVADO';

      await tx.user.update({
        where: { id: participantId },
        data: { status: nuevoEstado as never },
      });

      await tx.userHistoryStatus.create({
        data: {
          userId: participantId,
          procesoId: await procesoVisibleDe(tx, participantId),
          status: nuevoEstado as never,
          createdById,
        },
      });

      await espejarStatusDocumental(tx, participantId, nuevoEstado);

      const creatorPerson = createdById
        ? await tx.person.findUnique({
            where: { id: createdById },
            select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
          })
        : null;

      const createdBy = creatorPerson
        ? {
            id: creatorPerson.id,
            fullName: [creatorPerson.firstname, creatorPerson.middlename, creatorPerson.lastfathername, creatorPerson.lastmothername]
              .filter(Boolean)
              .join(' '),
          }
        : null;

      return {
        id: obs.id,
        userId: obs.userId,
        observation: obs.observation,
        status: obs.status,
        endDate: obs.endDate,
        createdAt: obs.createdAt,
        updatedAt: obs.updatedAt,
        createdById: obs.createdById,
        createdBy,
        etiquetas: obs.userObservationEtiquetas.map((e) => e.etiquetas),
        files: obs.userObservationFiles.map((f) => ({ id: f.id, file: f.file })),
      };
    });
  }

  async existsByDni(dni: string): Promise<boolean> {
    const person = await this.prisma.person.findFirst({ where: { dni }, select: { id: true } });
    if (!person) return false;
    const user = await this.prisma.user.findUnique({ where: { id: person.id }, select: { id: true } });
    return !!user;
  }

  async isUsernameTaken(username: string, excludeId?: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { username, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    return !!user;
  }

  async isEmailTaken(email: string, excludeId?: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { email, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    });
    return !!user;
  }

  async findCountryByName(name: string): Promise<{ id: string } | null> {
    return this.prisma.country.findFirst({ where: { name }, select: { id: true } });
  }

  async findOrCreateProgram(code: string, externalId: string | null): Promise<{ id: string }> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedExternalId = externalId?.trim() || null;

    const programs = await this.prisma.program.findMany({
      select: { id: true, code: true, idExterno: true },
    });

    const byExternalId = normalizedExternalId
      ? programs.find((p) => {
          if (!p.idExterno) return false;
          const dbExternalId = p.idExterno.trim();
          return (
            dbExternalId === normalizedExternalId ||
            Number(dbExternalId) === Number(normalizedExternalId)
          );
        })
      : undefined;

    const byCode = !byExternalId
      ? programs.find((p) => p.code.trim().toUpperCase() === normalizedCode)
      : undefined;

    const matched = byExternalId ?? byCode;
    if (matched) {
      // Backfill: enlaza el idExterno si se encontró por code pero aún no lo tiene.
      if (normalizedExternalId && matched.idExterno?.trim() !== normalizedExternalId) {
        await this.prisma.program.update({
          where: { id: matched.id },
          data: { idExterno: normalizedExternalId },
        });
      }
      return { id: matched.id };
    }

    return this.prisma.program.upsert({
      where: { code: normalizedCode },
      create: {
        idExterno: normalizedExternalId,
        code: normalizedCode,
        name: normalizedCode,
        status: true,
      },
      update: {},
      select: { id: true },
    });
  }

  async findOrCreateSponsor(code: string, externalId: string | null): Promise<{ id: string }> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedExternalId = externalId?.trim() || null;

    const sponsors = await this.prisma.sponsor.findMany({
      select: { id: true, code: true, idExterno: true },
    });

    const byExternalId = normalizedExternalId
      ? sponsors.find((s) => {
          if (!s.idExterno) return false;
          const dbExternalId = s.idExterno.trim();
          return (
            dbExternalId === normalizedExternalId ||
            Number(dbExternalId) === Number(normalizedExternalId)
          );
        })
      : undefined;

    const byCode = !byExternalId
      ? sponsors.find((s) => s.code.trim().toUpperCase() === normalizedCode)
      : undefined;

    const matched = byExternalId ?? byCode;
    if (matched) {
      // Backfill: enlaza el idExterno si se encontró por code pero aún no lo tiene.
      if (normalizedExternalId && matched.idExterno?.trim() !== normalizedExternalId) {
        await this.prisma.sponsor.update({
          where: { id: matched.id },
          data: { idExterno: normalizedExternalId },
        });
      }
      return { id: matched.id };
    }

    return this.prisma.sponsor.upsert({
      where: { code: normalizedCode },
      create: {
        idExterno: normalizedExternalId,
        code: normalizedCode,
        name: normalizedCode,
        status: true,
      },
      update: {},
      select: { id: true },
    });
  }

  async findOrCreateOptionProgram(shortDatabase: string, programId: string): Promise<{ id: string }> {
    // La identidad de un option program es la combinación (programId, shortDatabase).
    // Ya no se usa idExterno, name ni país/sponsor.
    const normalizedShortDatabase = shortDatabase.trim().toUpperCase();

    const existing = await this.prisma.optionProgram.findUnique({
      where: { programId_shortDatabase: { programId, shortDatabase: normalizedShortDatabase } },
      select: { id: true },
    });
    if (existing) return existing;

    return this.prisma.optionProgram.create({
      data: {
        shortDatabase: normalizedShortDatabase,
        programId,
        status: true,
      },
      select: { id: true },
    });
  }

  async findDefaultRole(): Promise<{ id: string }> {
    const role = await this.prisma.role.findFirst({
      where: { name: 'Participante', status: true },
      select: { id: true },
    });
    if (!role) throw new InternalServerErrorException('Rol "Participante" no encontrado.');
    return role;
  }

  async createWithHistory(data: CreateExternalUserData): Promise<void> {
    const id = randomUUID();
    await this.prisma.$transaction([
      this.prisma.person.create({
        data: {
          id,
          firstname: data.firstname,
          middlename: data.middlename,
          lastfathername: data.lastfathername,
          lastmothername: data.lastmothername,
          birthdate: data.birthdate,
          dni: data.dni,
        },
      }),
      this.prisma.user.create({
        data: {
          id,
          username: data.dni,
          password: data.passwordHash,
          roleId: data.roleId,
          countryId: data.countryId,
          programId: data.programId,
          sponsorId: data.sponsorId,
          optionProgramId: data.optionProgramId,
          status: data.status as never,
          employer: data.employer ?? null,
          status_hired: data.status_hired ?? null,
          hired_date: data.hired_date ?? null,
          jo_use_date: data.jo_use_date ?? null,
          programAgreementOK: data.programAgreementOK ?? null,
          fechadeenvioalsponsor: data.fechadeenvioalsponsor ?? null,
          fechaDSinUSE: data.fechaDSinUSE ?? null,
          statusSolRetiro: data.statusSolRetiro ?? null,
          statusExternal: data.statusExternal ?? null,
        },
      }),
      // Sin `procesoId`: el participante se esta creando y su proceso lo abre el sync mas tarde.
      // `crearProcesoAbierto` adopta las entradas huerfanas al abrir el primer ciclo.
      this.prisma.userHistoryStatus.create({
        data: { userId: id, status: data.status as never },
      }),
    ]);
  }

  async updateByDni(dni: string, data: UpdateExternalUserData): Promise<void> {
    const person = await this.prisma.person.findFirst({ where: { dni }, select: { id: true } });
    if (!person) throw new NotFoundException(`Usuario con DNI "${dni}" no encontrado.`);

    // Se resuelve antes de armar la transacción: la forma de array de `$transaction` no admite
    // await entre sus operaciones.
    const procesoId = await procesoVisibleDe(this.prisma, person.id);

    await this.prisma.$transaction([
      this.prisma.person.update({
        where: { id: person.id },
        data: {
          firstname: data.firstname,
          middlename: data.middlename,
          lastfathername: data.lastfathername,
          lastmothername: data.lastmothername,
          birthdate: data.birthdate,
        },
      }),
      this.prisma.user.update({
        where: { id: person.id },
        data: {
          countryId: data.countryId,
          programId: data.programId,
          sponsorId: data.sponsorId,
          optionProgramId: data.optionProgramId,
          status: data.status as never,
          employer: data.employer ?? null,
          email: data.email ?? null,
          status_hired: data.status_hired ?? null,
          hired_date: data.hired_date ?? null,
          jo_use_date: data.jo_use_date ?? null,
          programAgreementOK: data.programAgreementOK ?? null,
          fechadeenvioalsponsor: data.fechadeenvioalsponsor ?? null,
          fechaDSinUSE: data.fechaDSinUSE ?? null,
          statusSolRetiro: data.statusSolRetiro ?? null,
          statusExternal: data.statusExternal ?? null,
        },
      }),
      this.prisma.userHistoryStatus.create({
        data: { userId: person.id, procesoId, status: data.status as never },
      }),
    ]);
  }

  async closeObservation(observationId: string): Promise<string> {
    const obs = await this.prisma.userObservations.findUnique({
      where: { id: observationId },
      select: { userId: true },
    });
    if (!obs) throw new NotFoundException(`Observación #${observationId} no encontrada.`);

    await this.prisma.userObservations.update({
      where: { id: observationId },
      data: { endDate: new Date(), status: false },
    });

    return obs.userId;
  }

  async findActiveObservationTexts(userId: string): Promise<string[]> {
    const rows = await this.prisma.userObservations.findMany({
      where: { userId, status: true, endDate: null },
      orderBy: { createdAt: 'desc' },
      select: { observation: true },
    });
    return rows.map((row) => row.observation);
  }
}
