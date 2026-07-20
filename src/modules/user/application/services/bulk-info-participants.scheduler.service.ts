import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BulkInfoParticipantsUseCase } from '../use-cases/bulk-info-participants.use-case';

const PERU_TIMEZONE = 'America/Lima';

@Injectable()
export class BulkInfoParticipantsSchedulerService {
  private readonly logger = new Logger(BulkInfoParticipantsSchedulerService.name);

  constructor(private readonly bulkInfoParticipants: BulkInfoParticipantsUseCase) {}

  // Corre todos los días a las 2:00am hora de Perú. Misma sincronización que el endpoint
  // manual (bulk-info-participants), pero sin el correo de "documento observado" hacia el
  // participante — la notificación al admin con el resumen sí se envía igual.
  @Cron('0 0 2 * * *', { timeZone: PERU_TIMEZONE, name: 'bulk-info-participants-daily' })
  async handleDailySync(): Promise<void> {
    this.logger.log('BulkInfoParticipants (job diario) — iniciando sincronización automática.');
    try {
      await this.bulkInfoParticipants.execute({ suppressParticipantEmail: true });
    } catch (err) {
      // Ya logueado/notificado al admin dentro del use case — este catch solo evita que el
      // cron job quede en un estado de rechazo no manejado.
      this.logger.error('BulkInfoParticipants (job diario) — terminó con un error fatal.', err as Error);
    }
  }
}
