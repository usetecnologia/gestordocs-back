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

export type PrismaUserFull = UserGetPayload<{
  include: typeof USER_INCLUDE;
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
      user.createdAt,
      user.updatedAt,
      user.role,
      user.country ?? null,
      user.sponsor ?? null,
      user.program ?? null,
      user.optionProgram ?? null,
    );
  }
}
