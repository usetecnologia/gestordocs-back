import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IUserRepository,
  UserFilters,
  CreateUserData,
  UpdateUserData,
} from '../../domain/user.repository';
import { User } from '../../domain/user.entity';
import { UserMapper, USER_INCLUDE, PrismaUserFull } from './user.mapper';
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
    const where = {
      ...(status && { status }),
      ...(roleId && { roleId }),
      ...(countryId && { countryId }),
      ...(sponsorId && { sponsorId }),
      ...(programId && { programId }),
      ...(optionProgramId && { optionProgramId }),
      ...(search && {
        OR: [
          { email: { contains: search } },
          { username: { contains: search } },
        ],
      }),
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
      this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE }),
      this.prisma.person.findUnique({ where: { id } }),
    ]);
    if (!userRaw) return null;
    return UserMapper.toDomain(userRaw as PrismaUserFull, person as PersonModel | null);
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

  async addStatusHistory(userId: string, status: string): Promise<void> {
    await this.prisma.userHistoryStatus.create({
      data: { userId, status: status as never },
    });
  }
}
