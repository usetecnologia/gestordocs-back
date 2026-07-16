import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import { formatObservationsList } from '@common/utils/template-variables.util';
import {
  EmailAudienceRecipient,
  IEmailAudienceRepository,
} from '../../domain/email-audience.repository';

@Injectable()
export class EmailAudiencePrismaRepository implements IEmailAudienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserStatus(status: string): Promise<EmailAudienceRecipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: status as $Enums.UserStatus,
        email: { not: null },
        role: { name: 'Participante' },
      },
      select: {
        id: true,
        email: true,
        program: { select: { name: true } },
        sponsor: { select: { name: true } },
      },
    });
    if (users.length === 0) return [];

    const namesById = await this.getFullNamesByIds(users.map((u) => u.id));
    const observationsById = await this.getActiveObservationsByIds(users.map((u) => u.id));

    return users
      .filter((u): u is typeof u & { email: string } => !!u.email)
      .map((u) => ({
        userId: u.id,
        email: u.email,
        nombreParticipante: namesById.get(u.id) ?? '',
        nombrePrograma: u.program?.name ?? '',
        nombreSponsor: u.sponsor?.name ?? '',
        nombreDocumento: '',
        observacionesUsuario: observationsById.get(u.id) ?? '',
      }));
  }

  async findByDocumentStatus(status: string): Promise<EmailAudienceRecipient[]> {
    const rows = await this.prisma.userDocuments.findMany({
      where: { status: status as $Enums.DocumentSponsorStatus, statusDocument: true },
      distinct: ['userId'],
      orderBy: { updatedAt: 'desc' },
      select: {
        userId: true,
        documents: { select: { name: true } },
        documentSponsors: { select: { document: { select: { name: true } } } },
      },
    });
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, email: { not: null }, role: { name: 'Participante' } },
      select: {
        id: true,
        email: true,
        program: { select: { name: true } },
        sponsor: { select: { name: true } },
      },
    });
    const usersById = new Map(users.map((u) => [u.id, u]));
    const namesById = await this.getFullNamesByIds(userIds);

    const recipients: EmailAudienceRecipient[] = [];
    for (const row of rows) {
      const user = usersById.get(row.userId);
      if (!user?.email) continue;
      recipients.push({
        userId: row.userId,
        email: user.email,
        nombreParticipante: namesById.get(row.userId) ?? '',
        nombrePrograma: user.program?.name ?? '',
        nombreSponsor: user.sponsor?.name ?? '',
        nombreDocumento: row.documents?.name ?? row.documentSponsors?.document.name ?? '',
        observacionesUsuario: '',
      });
    }
    return recipients;
  }

  private async getActiveObservationsByIds(userIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.userObservations.findMany({
      where: { userId: { in: userIds }, status: true, endDate: null },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, observation: true },
    });

    const observationsByUserId = new Map<string, string[]>();
    for (const row of rows) {
      const list = observationsByUserId.get(row.userId) ?? [];
      list.push(row.observation);
      observationsByUserId.set(row.userId, list);
    }

    const result = new Map<string, string>();
    for (const [userId, observations] of observationsByUserId) {
      result.set(userId, formatObservationsList(observations));
    }
    return result;
  }

  private async getFullNamesByIds(ids: string[]): Promise<Map<string, string>> {
    const persons = await this.prisma.person.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstname: true,
        middlename: true,
        lastfathername: true,
        lastmothername: true,
      },
    });
    const map = new Map<string, string>();
    for (const p of persons) {
      map.set(
        p.id,
        [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' '),
      );
    }
    return map;
  }
}
