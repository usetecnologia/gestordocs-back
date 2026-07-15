import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import { findActionCodeByStatus } from '@modules/email-template/domain/action-status-map';
import { IUserStatusPort } from '../../domain/user-status.port';

@Injectable()
export class UserStatusPrisma implements IUserStatusPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailDispatchService: EmailDispatchService,
  ) {}

  async getStatus(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    return user?.status ?? null;
  }

  async updateStatus(userId: string, status: string, createdById?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: status as $Enums.UserStatus },
      });
      await tx.userHistoryStatus.create({
        data: { userId, status: status as $Enums.UserStatus, createdById },
      });
    });

    await this.dispatchStatusEmail(userId, status);
  }

  private async dispatchStatusEmail(userId: string, status: string): Promise<void> {
    const actionCode = findActionCodeByStatus('USER', status);
    if (!actionCode) return;

    const [user, person] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          program: { select: { name: true } },
          sponsor: { select: { name: true } },
        },
      }),
      this.prisma.person.findUnique({
        where: { id: userId },
        select: { firstname: true, middlename: true, lastfathername: true, lastmothername: true },
      }),
    ]);
    if (!user?.email) return;

    const nombreParticipante = person
      ? [person.firstname, person.middlename, person.lastfathername, person.lastmothername]
          .filter(Boolean)
          .join(' ')
      : '';

    await this.emailDispatchService.dispatchByActionCode(actionCode, {
      email: user.email,
      userId,
      nombreParticipante,
      nombrePrograma: user.program?.name ?? '',
      nombreSponsor: user.sponsor?.name ?? '',
    });
  }

  async getRole(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    return user?.role?.name ?? null;
  }

  async hasActiveObservation(userId: string): Promise<boolean> {
    const count = await this.prisma.userObservations.count({
      where: { userId, status: true, endDate: null },
    });
    return count > 0;
  }

  async findLastStatusBeforeInactive(userId: string): Promise<string | null> {
    const record = await this.prisma.userHistoryStatus.findFirst({
      where: { userId, status: { not: 'INACTIVO' } },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    return record?.status ?? null;
  }
}
