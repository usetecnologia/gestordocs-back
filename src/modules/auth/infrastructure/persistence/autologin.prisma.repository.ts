import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/prisma/prisma.service';
import type { PersonModel } from 'prisma/generated/prisma/models';
import { IAutoLoginRepository, UpsertByDniData } from '../../domain/autologin.repository';
import { AuthCredentials } from '../../domain/auth-credentials';

type PrismaAuthUser = {
  id: string;
  username: string | null;
  email: string | null;
  password: string | null;
  status: string;
  role: { id: string; name: string; code: string | null };
  country: { id: string; name: string; code: string } | null;
  sponsor: { id: string; name: string; code: string } | null;
  program: { id: string; name: string; code: string } | null;
  optionProgram: { id: string; name: string; shortName: string } | null;
};

const AUTH_INCLUDE = {
  role: { select: { id: true, name: true, code: true } },
  country: { select: { id: true, name: true, code: true } },
  sponsor: { select: { id: true, name: true, code: true } },
  program: { select: { id: true, name: true, code: true } },
  optionProgram: { select: { id: true, name: true, shortName: true } },
} as const;

const toCode = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

function toCredentials(user: PrismaAuthUser, person: PersonModel): AuthCredentials {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    passwordHash: user.password,
    role: user.role,
    status: user.status,
    person: {
      firstname: person.firstname,
      middlename: person.middlename ?? null,
      lastfathername: person.lastfathername,
      lastmothername: person.lastmothername ?? null,
      phone: person.phone ?? null,
      avatar: person.avatar ?? null,
      dni: person.dni ?? null,
    },
    country: user.country,
    program: user.program,
    sponsor: user.sponsor,
    optionProgram: user.optionProgram,
  };
}

@Injectable()
export class AutoLoginPrismaRepository implements IAutoLoginRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByDni(dni: string): Promise<AuthCredentials | null> {
    const person = await this.prisma.person.findFirst({ where: { dni } });
    if (!person) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: person.id },
      include: AUTH_INCLUDE,
    });
    if (!user) return null;
    return toCredentials(user as PrismaAuthUser, person as PersonModel);
  }

  async findCountryByName(name: string): Promise<{ id: string } | null> {
    return this.prisma.country.findFirst({ where: { name }, select: { id: true } });
  }

  async findOrCreateProgram(name: string): Promise<{ id: string }> {
    const code = toCode(name);
    return this.prisma.program.upsert({
      where: { code },
      create: { code, name, status: true },
      update: {},
      select: { id: true },
    });
  }

  async findOrCreateSponsor(name: string): Promise<{ id: string }> {
    const code = toCode(name);
    return this.prisma.sponsor.upsert({
      where: { code },
      create: { code, name, status: true },
      update: {},
      select: { id: true },
    });
  }

  async findOrCreateOptionProgram(
    name: string,
    countryId: string,
    programId: string,
    sponsorId: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.optionProgram.findFirst({
      where: { name },
      select: { id: true },
    });
    if (existing) return existing;

    const shortName = name.split(/[\s(]/)[0].slice(0, 50) || name.slice(0, 50);
    return this.prisma.optionProgram.create({
      data: {
        name,
        shortName,
        shortDatabase: shortName,
        countryId,
        programId,
        sponsorId,
        status: true,
        hideJobFair: false,
      },
      select: { id: true },
    });
  }

  async upsertByDni(data: UpsertByDniData): Promise<AuthCredentials> {
    const existingPerson = await this.prisma.person.findFirst({ where: { dni: data.dni } });

    if (existingPerson) {
      await this.prisma.$transaction([
        this.prisma.person.update({
          where: { id: existingPerson.id },
          data: {
            firstname: data.firstname,
            middlename: data.middlename,
            lastfathername: data.lastfathername,
            lastmothername: data.lastmothername,
            birthdate: data.birthdate,
          },
        }),
        this.prisma.user.update({
          where: { id: existingPerson.id },
          data: {
            countryId: data.countryId,
            programId: data.programId,
            sponsorId: data.sponsorId,
            optionProgramId: data.optionProgramId,
          },
        }),
      ]);
    } else {
      const role = await this.findDefaultRole();
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
            roleId: role.id,
            countryId: data.countryId,
            programId: data.programId,
            sponsorId: data.sponsorId,
            optionProgramId: data.optionProgramId,
            status: 'SIN_DOCUMENTOS',
          },
        }),
      ]);
    }

    const result = await this.findByDni(data.dni);
    if (!result) throw new InternalServerErrorException('Error al recuperar usuario tras upsert.');
    return result;
  }

  async findDefaultRole(): Promise<{ id: string; name: string; code: string | null }> {
    const role = await this.prisma.role.findFirst({
      where: { name: 'Participante', status: true },
      select: { id: true, name: true, code: true },
    });
    if (!role) throw new InternalServerErrorException('Rol "Participante" no encontrado en la base de datos.');
    return role;
  }
}
