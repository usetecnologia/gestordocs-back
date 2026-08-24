import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import { IEmailLogRepository, CreateEmailLogData } from '../../domain/email-log.repository';
import { EmailLog } from '../../domain/email-log.entity';

@Injectable()
export class EmailLogPrismaRepository implements IEmailLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El `procesoId` se resuelve acá y no en cada punto de envío: hay siete lugares que registran
   * correos y ninguno necesita saber de procesos. Es el mismo criterio con el que se resuelve el
   * espejo del estado documental — la regla vive en un solo lugar.
   *
   * Se usa el proceso **visible** del destinatario, el mismo con el que se filtra el historial al
   * mostrarlo: así un correo registrado ahora se ve ahora. Queda en `null` si no hay destinatario
   * —los registros a nivel de plantilla— o si el destinatario no tiene proceso, como el staff.
   */
  async create(data: CreateEmailLogData): Promise<EmailLog> {
    const procesoId = data.recipientUserId
      ? ((
          await this.prisma.user.findUnique({
            where: { id: data.recipientUserId },
            select: { procesoVisibleId: true },
          })
        )?.procesoVisibleId ?? null)
      : null;

    const row = await this.prisma.emailLog.create({ data: { ...data, procesoId } });
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
