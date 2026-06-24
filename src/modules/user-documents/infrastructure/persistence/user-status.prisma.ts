import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IUserStatusPort } from '../../domain/user-status.port';

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
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: status as $Enums.UserStatus },
      }),
      this.prisma.userHistoryStatus.create({
        data: { userId, status: status as $Enums.UserStatus, createdById },
      }),
    ]);
  }
}
