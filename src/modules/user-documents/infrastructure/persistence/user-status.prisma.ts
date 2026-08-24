import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IUserStatusPort } from '../../domain/user-status.port';
import { espejarStatusDocumental } from '@modules/proceso/infrastructure/persistence/espejar-status-documental';

@Injectable()
export class UserStatusPrisma implements IUserStatusPort {
  constructor(private readonly prisma: PrismaService) {}

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
      // El proceso abierto guarda el mismo estado: es el que sobrevive al cierre del ciclo.
      await espejarStatusDocumental(tx, userId, status);
    });
  }

  async getRole(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    return user?.role?.name ?? null;
  }

  /**
   * Observación vigente **del ciclo en curso**. Es la regla 0 de `TerminarRevision`: manda al
   * participante a OBSERVADO sin mirar sus documentos.
   *
   * El filtro por proceso es lo que impide que una observación que quedó abierta en un ciclo
   * anterior arrastre al ciclo nuevo — que nacía en SIN_DOCUMENTOS y pasaba a OBSERVADO el mismo
   * día, sin que el participante hubiera subido nada. La observación no se cierra ni se oculta:
   * sigue donde se levantó, y deja de opinar sobre un ciclo que no es el suyo.
   */
  async hasActiveObservation(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { procesoVisibleId: true },
    });
    if (!user?.procesoVisibleId) return false;

    const count = await this.prisma.userObservations.count({
      where: {
        userId,
        procesoId: user.procesoVisibleId,
        status: true,
        endDate: null,
      },
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

  async hasBeenSentToSponsor(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fechadeenvioalsponsor: true },
    });
    return !!user?.fechadeenvioalsponsor?.trim();
  }
}
