import type { EmailTemplateType } from './email-template.enums';

export enum EmailLogStatus {
  ENVIADO = 'ENVIADO',
  FALLIDO = 'FALLIDO',
  OMITIDO = 'OMITIDO',
}

export class EmailLog {
  constructor(
    public readonly id: string,
    public readonly actionId: string | null,
    public readonly actionCode: string,
    public readonly templateId: string | null,
    public readonly templateCode: string | null,
    public readonly recipientUserId: string | null,
    public readonly recipientEmail: string | null,
    public readonly subject: string | null,
    public readonly status: EmailLogStatus,
    public readonly source: EmailTemplateType,
    public readonly errorMessage: string | null,
    public readonly sentAt: Date,
  ) {}
}
