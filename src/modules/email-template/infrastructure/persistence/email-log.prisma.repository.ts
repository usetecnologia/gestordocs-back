import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IEmailLogRepository, CreateEmailLogData } from '../../domain/email-log.repository';
import { EmailLog } from '../../domain/email-log.entity';

@Injectable()
export class EmailLogPrismaRepository implements IEmailLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEmailLogData): Promise<EmailLog> {
    const row = await this.prisma.emailLog.create({ data });
    return new EmailLog(
      row.id,
      row.actionId,
      row.actionCode,
      row.templateId,
      row.templateCode,
      row.recipientUserId,
      row.recipientEmail,
      row.subject,
      row.status as unknown as EmailLog['status'],
      row.source as unknown as EmailLog['source'],
      row.errorMessage,
      row.sentAt,
    );
  }
}
