import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_LOG_REPOSITORY,
  IEmailLogRepository,
  CreateEmailLogData,
} from '../../domain/email-log.repository';

@Injectable()
export class EmailLogService {
  private readonly logger = new Logger(EmailLogService.name);

  constructor(
    @Inject(EMAIL_LOG_REPOSITORY) private readonly repo: IEmailLogRepository,
  ) {}

  // Nunca lanza: un fallo al escribir el historial no debe romper el envío de correo
  // ni el flujo de negocio que lo disparó.
  async record(data: CreateEmailLogData): Promise<void> {
    try {
      await this.repo.create(data);
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el historial de correo para la acción "${data.actionCode}": ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
