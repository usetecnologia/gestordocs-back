import type { UserGetPayload, PersonModel } from 'prisma/generated/prisma/models';
import { User } from '../../domain/user.entity';
import { UserStatus } from '../../domain/user.enums';

export const USER_INCLUDE = {
  role: { select: { id: true, name: true, code: true } },
  country: { select: { id: true, name: true, code: true } },
  sponsor: { select: { id: true, name: true, code: true } },
  program: { select: { id: true, name: true, code: true } },
  optionProgram: { select: { id: true, name: true, shortName: true } },
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
} as const;

export type PrismaUserFull = UserGetPayload<{
  include: typeof USER_INCLUDE;
}>;

export type PrismaUserDetail = UserGetPayload<{
  include: typeof USER_DETAIL_INCLUDE;
}>;

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
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
    );
  }

  static toDetailDomain(
    user: PrismaUserDetail,
    person: PersonModel | null,
    creatorPersonMap: Map<string, string> = new Map(),
  ): User {
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
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
      user.userObservations.map((obs) => ({
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
      user.userHistories.map((h) => ({
        id: h.id,
        status: h.status as string,
        createdById: h.createdById ?? null,
        createdBy: h.createdById && creatorPersonMap.has(h.createdById)
          ? { id: h.createdById, fullName: creatorPersonMap.get(h.createdById)! }
          : null,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
      })),
    );
  }
}
