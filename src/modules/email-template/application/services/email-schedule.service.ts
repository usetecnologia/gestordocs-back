import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ResendService } from '@shared/resend/resend.service';
import { buildTemplateVariables, substituteTemplateVariables } from '@common/utils/template-variables.util';
import { ACTION_STATUS_MAP } from '../../domain/action-status-map';
import { PERU_TIMEZONE, WeekDay, EmailTemplateType } from '../../domain/email-template.enums';
import { EmailTemplate } from '../../domain/email-template.entity';
import { EmailLogStatus } from '../../domain/email-log.entity';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';
import {
  EMAIL_AUDIENCE_REPOSITORY,
  IEmailAudienceRepository,
} from '../../domain/email-audience.repository';
import { EmailLogService } from './email-log.service';

@Injectable()
export class EmailScheduleService {
  private readonly logger = new Logger(EmailScheduleService.name);

  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_AUDIENCE_REPOSITORY) private readonly audienceRepo: IEmailAudienceRepository,
    private readonly resendService: ResendService,
    private readonly emailLogService: EmailLogService,
  ) {}

  // Corre cada minuto en hora de Perú (America/Lima, sin horario de verano) y dispara las
  // plantillas PROGRAMADA cuyo día+hora coincide con el momento actual.
  @Cron('0 * * * * *', { timeZone: PERU_TIMEZONE, name: 'email-templates-programada' })
  async handleScheduledTemplates(): Promise<void> {
    const { day, time } = this.getCurrentLimaDayAndTime();
    const templates = await this.templateRepo.findAllActiveProgramada();

    const matching = templates.filter(
      (t) => t.schedule?.time === time && t.schedule.days.includes(day),
    );

    for (const template of matching) {
      await this.dispatchTemplate(template);
    }
  }

  private async dispatchTemplate(template: EmailTemplate): Promise<void> {
    const mapping = ACTION_STATUS_MAP[template.action.code];
    if (!mapping) {
      this.logger.warn(
        `Plantilla PROGRAMADA "${template.code}" está vinculada a la acción "${template.action.code}", ` +
          'que no tiene un estado de audiencia asociado. Se omite el envío.',
      );
      await this.emailLogService.record({
        actionId: template.actionId,
        actionCode: template.action.code,
        templateId: template.id,
        templateCode: template.code,
        status: EmailLogStatus.OMITIDO,
        source: EmailTemplateType.PROGRAMADA,
        errorMessage:
          `La acción "${template.action.code}" no tiene un estado de audiencia asociado ` +
          '(no está en ACTION_STATUS_MAP).',
      });
      return;
    }

    const recipients =
      mapping.scope === 'USER'
        ? await this.audienceRepo.findByUserStatus(mapping.status)
        : await this.audienceRepo.findByDocumentStatus(mapping.status);

    if (recipients.length === 0) {
      await this.emailLogService.record({
        actionId: template.actionId,
        actionCode: template.action.code,
        templateId: template.id,
        templateCode: template.code,
        status: EmailLogStatus.OMITIDO,
        source: EmailTemplateType.PROGRAMADA,
        errorMessage: `No había destinatarios con el estado "${mapping.status}" en este momento.`,
      });
      return;
    }

    for (const recipient of recipients) {
      const variables = buildTemplateVariables(recipient);
      const subject = substituteTemplateVariables(template.subject, variables);
      const html = substituteTemplateVariables(template.htmlContent, variables);

      try {
        await this.resendService.sendMail({ to: recipient.email, subject, html });

        await this.emailLogService.record({
          actionId: template.actionId,
          actionCode: template.action.code,
          templateId: template.id,
          templateCode: template.code,
          recipientUserId: recipient.userId,
          recipientEmail: recipient.email,
          subject,
          status: EmailLogStatus.ENVIADO,
          source: EmailTemplateType.PROGRAMADA,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `No se pudo enviar la plantilla "${template.code}" a ${recipient.email}: ${errorMessage}`,
        );

        await this.emailLogService.record({
          actionId: template.actionId,
          actionCode: template.action.code,
          templateId: template.id,
          templateCode: template.code,
          recipientUserId: recipient.userId,
          recipientEmail: recipient.email,
          subject,
          status: EmailLogStatus.FALLIDO,
          source: EmailTemplateType.PROGRAMADA,
          errorMessage,
        });
      }
    }
  }

  private getCurrentLimaDayAndTime(): { day: WeekDay; time: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: PERU_TIMEZONE,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());

    const weekdayName = parts.find((p) => p.type === 'weekday')!.value.toUpperCase();
    const hour = parts.find((p) => p.type === 'hour')!.value;
    const minute = parts.find((p) => p.type === 'minute')!.value;

    return { day: weekdayName as WeekDay, time: `${hour}:${minute}` };
  }
}
