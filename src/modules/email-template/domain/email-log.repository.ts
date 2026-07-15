import type { EmailTemplateType } from './email-template.enums';
import type { EmailLog, EmailLogStatus } from './email-log.entity';

export interface CreateEmailLogData {
  actionId?: string | null;
  actionCode: string;
  templateId?: string | null;
  templateCode?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  subject?: string | null;
  status: EmailLogStatus;
  source: EmailTemplateType;
  errorMessage?: string | null;
}

export interface IEmailLogRepository {
  create(data: CreateEmailLogData): Promise<EmailLog>;
}

export const EMAIL_LOG_REPOSITORY = Symbol('EMAIL_LOG_REPOSITORY');
