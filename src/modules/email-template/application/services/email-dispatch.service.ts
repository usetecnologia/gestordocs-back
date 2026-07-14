import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResendService } from '@shared/resend/resend.service';
import {
  EMAIL_ACTION_REPOSITORY,
  IEmailActionRepository,
} from '@modules/email-action/domain/email-action.repository';
import {
  buildTemplateVariables,
  substituteTemplateVariables,
  EmailTemplateVariables,
} from '@common/utils/template-variables.util';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';

export interface EmailDispatchContext extends Partial<Omit<EmailTemplateVariables, 'fechaActual'>> {
  email: string | null | undefined;
}

@Injectable()
export class EmailDispatchService {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @Inject(EMAIL_ACTION_REPOSITORY) private readonly actionRepo: IEmailActionRepository,
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    private readonly resendService: ResendService,
  ) {}

  // Nunca lanza: un fallo de envío de correo no debe romper el flujo de negocio que lo dispara
  // (aceptar/observar documento, cambio de estado, autologin, etc.).
  async dispatchByActionCode(actionCode: string, context: EmailDispatchContext): Promise<void> {
    if (!context.email) return;

    try {
      const action = await this.actionRepo.findActiveByCode(actionCode);
      if (!action) return;

      const template = await this.templateRepo.findActiveByActionId(action.id);
      if (!template) return;

      const variables = buildTemplateVariables(context);
      const subject = substituteTemplateVariables(template.subject, variables);
      const html = substituteTemplateVariables(template.htmlContent, variables);

      await this.resendService.sendMail({ to: context.email, subject, html });
    } catch (error) {
      this.logger.error(
        `No se pudo despachar el correo para la acción "${actionCode}": ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
