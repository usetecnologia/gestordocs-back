import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IEmailActionRepository } from '../../domain/email-action.repository';
import { EmailAction } from '../../domain/email-action.entity';
import { EmailActionMapper } from './email-action.mapper';

@Injectable()
export class EmailActionPrismaRepository implements IEmailActionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllActive(): Promise<EmailAction[]> {
    const rows = await this.prisma.emailAction.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(EmailActionMapper.toDomain);
  }

  async findById(id: string): Promise<EmailAction | null> {
    const row = await this.prisma.emailAction.findUnique({ where: { id } });
    return row ? EmailActionMapper.toDomain(row) : null;
  }

  async findActiveByCode(code: string): Promise<EmailAction | null> {
    const row = await this.prisma.emailAction.findFirst({ where: { code, status: true } });
    return row ? EmailActionMapper.toDomain(row) : null;
  }
}
