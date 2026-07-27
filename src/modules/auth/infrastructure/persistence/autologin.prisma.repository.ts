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

  async findOrCreateOptionProgram(
    name: string,
    code: string | null,
    externalId: string | null,
    countryId: string,
    programId: string,
    sponsorId: string | null,
  ): Promise<{ id: string }> {
    const normalizedCode = code?.trim().toUpperCase() || null;
    const normalizedExternalId = externalId?.trim() || null;

    const optionPrograms = await this.prisma.optionProgram.findMany({
      select: { id: true, name: true, shortDatabase: true, idExterno: true },
    });

    // 1. Primero por ID externo (comparando como string y como número).
    const byExternalId = normalizedExternalId
      ? optionPrograms.find((o) => {
          if (!o.idExterno) return false;
          const dbExternalId = o.idExterno.trim();
          return (
            dbExternalId === normalizedExternalId ||
            Number(dbExternalId) === Number(normalizedExternalId)
          );
        })
      : undefined;

    // 2. Luego por code (shortDatabase).
    const byCode =
      !byExternalId && normalizedCode
        ? optionPrograms.find((o) => o.shortDatabase?.trim().toUpperCase() === normalizedCode)
        : undefined;

    // 3. Fallback por nombre — preserva el comportamiento anterior para registros ya existentes.
    const byName =
      !byExternalId && !byCode
        ? optionPrograms.find(
            (o) => o.name.trim().toUpperCase() === name.trim().toUpperCase(),
          )
        : undefined;

    const matched = byExternalId ?? byCode ?? byName;

    // Si ya existe, rellena el idExterno y el code faltantes o desactualizados (backfill),
    // igual que el sync masivo de link-data. Así el registro queda enlazado a Workuse.
    if (matched) {
      const updates: { idExterno?: string; shortDatabase?: string } = {};
      if (normalizedExternalId && matched.idExterno?.trim() !== normalizedExternalId) {
        updates.idExterno = normalizedExternalId;
      }
      if (normalizedCode && matched.shortDatabase?.trim().toUpperCase() !== normalizedCode) {
        updates.shortDatabase = normalizedCode;
      }
      if (Object.keys(updates).length > 0) {
        await this.prisma.optionProgram.update({ where: { id: matched.id }, data: updates });
      }
      return { id: matched.id };
    }

    const shortName = name.split(/[\s(]/)[0].slice(0, 50) || name.slice(0, 50);
    return this.prisma.optionProgram.create({
      data: {
        idExterno: normalizedExternalId,
        name,
        shortName,
        shortDatabase: normalizedCode ?? shortName,
        countryId,
        programId,
        sponsorId: sponsorId ?? undefined,
        status: true,
        hideJobFair: false,
      },
      select: { id: true },
    });
  }

  async upsertByDni(data: UpsertByDniData): Promise<AuthCredentials> {
    const existingPerson = await this.prisma.person.findFirst({ where: { dni: data.dni } });

    if (existingPerson) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any[] = [
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
            ...(data.employer !== undefined && { employer: data.employer }),
            ...(data.status_hired !== undefined && { status_hired: data.status_hired }),
            ...(data.hired_date !== undefined && { hired_date: data.hired_date }),
            ...(data.jo_use_date !== undefined && { jo_use_date: data.jo_use_date }),
            ...(data.programAgreementOK !== undefined && { programAgreementOK: data.programAgreementOK }),
            ...(data.fechadeenvioalsponsor !== undefined && { fechadeenvioalsponsor: data.fechadeenvioalsponsor }),
            ...(data.fechaDSinUSE !== undefined && { fechaDSinUSE: data.fechaDSinUSE }),
            ...(data.statusSolRetiro !== undefined && { statusSolRetiro: data.statusSolRetiro }),
            ...(data.statusExternal !== undefined && { statusExternal: data.statusExternal }),
            ...(data.userStatus && { status: data.userStatus as never }),
            ...(data.email !== undefined && { email: data.email }),
          },
        }),
      ];

      if (data.userStatus) {
        ops.push(
          this.prisma.userHistoryStatus.create({
            data: { userId: existingPerson.id, status: data.userStatus as never },
          }),
        );
      }

      await this.prisma.$transaction(ops);
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
            email: data.email ?? null,
            roleId: role.id,
            countryId: data.countryId,
            programId: data.programId,
            sponsorId: data.sponsorId,
            optionProgramId: data.optionProgramId,
            status: (data.userStatus ?? 'SIN_DOCUMENTOS') as never,
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
        this.prisma.userHistoryStatus.create({
          data: {
            userId: id,
            status: (data.userStatus ?? 'SIN_DOCUMENTOS') as never,
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
