import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResendService } from '@shared/resend/resend.service';
import {
  EMAIL_ACTION_REPOSITORY,
  IEmailActionRepository,
} from '@modules/email-action/domain/email-action.repository';
import type { EmailAction } from '@modules/email-action/domain/email-action.entity';
import {
  buildTemplateVariables,
  substituteTemplateVariables,
  EmailTemplateVariables,
} from '@common/utils/template-variables.util';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';
import type { EmailTemplate } from '../../domain/email-template.entity';
import { EmailTemplateType } from '../../domain/email-template.enums';
import { EmailLogStatus } from '../../domain/email-log.entity';
import { EmailLogService } from './email-log.service';

export interface EmailDispatchContext extends Partial<Omit<EmailTemplateVariables, 'fechaActual'>> {
  email: string | null | undefined;
  userId?: string | null;
}

@Injectable()
export class EmailDispatchService {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @Inject(EMAIL_ACTION_REPOSITORY) private readonly actionRepo: IEmailActionRepository,
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    private readonly resendService: ResendService,
    private readonly emailLogService: EmailLogService,
  ) {}

  // Nunca lanza: un fallo de envío de correo no debe romper el flujo de negocio que lo dispara
  // (aceptar/observar documento, cambio de estado, autologin, etc.).
  async dispatchByActionCode(actionCode: string, context: EmailDispatchContext): Promise<void> {
    const recipientUserId = context.userId ?? null;

    if (!context.email) {
      await this.emailLogService.record({
        actionCode,
        recipientUserId,
        recipientEmail: null,
        status: EmailLogStatus.OMITIDO,
        source: EmailTemplateType.NORMAL,
        errorMessage: 'Sin correo electrónico registrado para el destinatario.',
      });
      return;
    }

    let action: EmailAction | null = null;
    let template: EmailTemplate | null = null;

    try {
      action = await this.actionRepo.findActiveByCode(actionCode);
      if (!action) {
        await this.emailLogService.record({
          actionCode,
          recipientUserId,
          recipientEmail: context.email,
          status: EmailLogStatus.OMITIDO,
          source: EmailTemplateType.NORMAL,
          errorMessage: 'Acción de correo no encontrada o inactiva.',
        });
        return;
      }

      template = await this.templateRepo.findActiveByActionId(action.id);
      if (!template) {
        await this.emailLogService.record({
          actionId: action.id,
          actionCode,
          recipientUserId,
          recipientEmail: context.email,
          status: EmailLogStatus.OMITIDO,
          source: EmailTemplateType.NORMAL,
          errorMessage: 'No hay una plantilla activa para esta acción.',
        });
        return;
      }

      const variables = buildTemplateVariables(context);
      const subject = substituteTemplateVariables(template.subject, variables);
      const html = substituteTemplateVariables(template.htmlContent, variables);

      await this.resendService.sendMail({ to: context.email, subject, html });

      await this.emailLogService.record({
        actionId: action.id,
        actionCode,
        templateId: template.id,
        templateCode: template.code,
        recipientUserId,
        recipientEmail: context.email,
        subject,
        status: EmailLogStatus.ENVIADO,
        source: EmailTemplateType.NORMAL,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`No se pudo despachar el correo para la acción "${actionCode}": ${errorMessage}`);

      await this.emailLogService.record({
        actionId: action?.id ?? null,
        actionCode,
        templateId: template?.id ?? null,
        templateCode: template?.code ?? null,
        recipientUserId,
        recipientEmail: context.email,
        status: EmailLogStatus.FALLIDO,
        source: EmailTemplateType.NORMAL,
        errorMessage,
      });
    }
  }
}
