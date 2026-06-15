import { Injectable } from '@nestjs/common';
import { $Enums } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IUserStatusPort } from '../../domain/user-status.port';

@Injectable()
export class UserStatusPrisma implements IUserStatusPort {
  constructor(private readonly prisma: PrismaService) {}

  async updateStatus(userId: string, status: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: status as $Enums.UserStatus },
    });
  }
}
