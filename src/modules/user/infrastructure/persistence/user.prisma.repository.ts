import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IUserRepository,
  UserFilters,
  CreateUserData,
  UpdateUserData,
  CreateObservationData,
  ObservationResult,
} from '../../domain/user.repository';
import { User } from '../../domain/user.entity';
import { UserMapper, USER_INCLUDE, USER_DETAIL_INCLUDE, PrismaUserFull, PrismaUserDetail } from './user.mapper';
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

@Injectable()
export class UserPrismaRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({
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

  async findById(id: string): Promise<User | null> {
    const [userRaw, person] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id }, include: USER_DETAIL_INCLUDE }),
      this.prisma.person.findUnique({ where: { id } }),
    ]);
    if (!userRaw) return null;

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

    return UserMapper.toDetailDomain(u, person as PersonModel | null, creatorPersonMap);
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
      await this.prisma.user.update({ where: { id }, data: userData });
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
      data: { userId, status: status as never, createdById },
    });
  }

  async createObservation({ participantId, observation, createdById, etiquetaIds, files }: CreateObservationData): Promise<ObservationResult> {
    return this.prisma.$transaction(async (tx) => {
      const obs = await tx.userObservations.create({
        data: {
          userId: participantId,
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

      await tx.user.update({
        where: { id: participantId },
        data: { status: 'OBSERVADO' as never },
      });

      await tx.userHistoryStatus.create({
        data: { userId: participantId, status: 'OBSERVADO' as never, createdById },
      });

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

  async closeObservation(observationId: string, createdById?: string): Promise<void> {
    const obs = await this.prisma.userObservations.findUnique({
      where: { id: observationId },
      select: { userId: true },
    });
    if (!obs) throw new NotFoundException(`Observación #${observationId} no encontrada.`);

    await this.prisma.$transaction([
      this.prisma.userObservations.update({
        where: { id: observationId },
        data: { endDate: new Date(), status: false },
      }),
      this.prisma.user.update({
        where: { id: obs.userId },
        data: { status: 'PENDIENTE_REVISAR' as never },
      }),
      this.prisma.userHistoryStatus.create({
        data: { userId: obs.userId, status: 'PENDIENTE_REVISAR' as never, createdById },
      }),
    ]);
  }
}
