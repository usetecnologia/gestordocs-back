import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IAuthRepository } from '../../domain/auth.repository';
import { AuthCredentials } from '../../domain/auth-credentials';

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

function toCredentials(user: PrismaAuthUser): AuthCredentials {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.password,
    role: user.role,
    status: user.status,
  };
}

@Injectable()
export class AuthPrismaRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AuthCredentials | null> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      include: AUTH_USER_INCLUDE,
    });
    return user ? toCredentials(user as PrismaAuthUser) : null;
  }

  async findByUsername(username: string): Promise<AuthCredentials | null> {
    const user = await this.prisma.user.findFirst({
      where: { username },
      include: AUTH_USER_INCLUDE,
    });
    return user ? toCredentials(user as PrismaAuthUser) : null;
  }
}
