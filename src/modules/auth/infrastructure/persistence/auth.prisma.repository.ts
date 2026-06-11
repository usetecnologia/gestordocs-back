import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IAuthRepository } from '../../domain/auth.repository';
import { AuthCredentials } from '../../domain/auth-credentials';
import type { PersonModel } from 'prisma/generated/prisma/models';

const AUTH_USER_INCLUDE = {
  role: { select: { id: true, name: true, code: true } },
} as const;

type PrismaAuthUser = {
  id: string;
  username: string | null;
  email: string | null;
  password: string | null;
  status: string;
  role: { id: string; name: string; code: string | null };
};

function toCredentials(user: PrismaAuthUser, person: PersonModel | null): AuthCredentials {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.password,
    role: user.role,
    status: user.status,
    person: person
      ? {
          firstname: person.firstname,
          middlename: person.middlename,
          lastfathername: person.lastfathername,
          lastmothername: person.lastmothername,
          phone: person.phone,
          avatar: person.avatar,
        }
      : null,
  };
}

@Injectable()
export class AuthPrismaRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async findUserWithPerson(
    where: { email?: string; username?: string; id?: string },
  ): Promise<AuthCredentials | null> {
    const user = await this.prisma.user.findFirst({
      where,
      include: AUTH_USER_INCLUDE,
    });
    if (!user) return null;
    const person = await this.prisma.person.findUnique({ where: { id: user.id } });
    return toCredentials(user as PrismaAuthUser, person as PersonModel | null);
  }

  findByEmail(email: string): Promise<AuthCredentials | null> {
    return this.findUserWithPerson({ email });
  }

  findByUsername(username: string): Promise<AuthCredentials | null> {
    return this.findUserWithPerson({ username });
  }

  findById(id: string): Promise<AuthCredentials | null> {
    return this.findUserWithPerson({ id });
  }
}
