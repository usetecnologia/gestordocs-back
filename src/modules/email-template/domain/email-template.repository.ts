import { EmailTemplate, EmailTemplateSchedule } from './email-template.entity';
import { EmailTemplateType } from './email-template.enums';

export interface EmailTemplateFilters {
  page: number;
  limit: number;
  search?: string;
  status?: boolean;
}

export interface CreateEmailTemplateData {
  name: string;
  code: string;
  subject: string;
  htmlContent: string;
  type: EmailTemplateType;
  actionId: string;
  schedule?: EmailTemplateSchedule | null;
  status?: boolean;
  createdById?: string;
}

export interface UpdateEmailTemplateData {
  name?: string;
  code?: string;
  subject?: string;
  htmlContent?: string;
  type?: EmailTemplateType;
  actionId?: string;
  schedule?: EmailTemplateSchedule | null;
  status?: boolean;
  updatedById?: string;
}

// Señal de conflicto que solo puede surgir dentro de la transacción atómica de create/update
// (ver EmailTemplatePrismaRepository) — el chequeo previo en el use case (hasActiveTemplateForAction)
// ya cubre el caso normal; esto es el resguardo contra dos peticiones concurrentes para la misma acción.
export class ActiveTemplateConflictError extends Error {
  constructor(public readonly actionId: string) {
    super(`Ya existe una plantilla activa para la acción ${actionId}.`);
    this.name = 'ActiveTemplateConflictError';
  }
}

export interface IEmailTemplateRepository {
  findAll(filters: EmailTemplateFilters): Promise<{ data: EmailTemplate[]; total: number }>;
  findById(id: string): Promise<EmailTemplate | null>;
  isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
  hasActiveTemplateForAction(actionId: string, excludeId?: string): Promise<boolean>;
  findActiveByActionId(actionId: string): Promise<EmailTemplate | null>;
  findAllActiveProgramada(): Promise<EmailTemplate[]>;
  create(data: CreateEmailTemplateData): Promise<EmailTemplate>;
  update(id: string, data: UpdateEmailTemplateData): Promise<EmailTemplate>;
  delete(id: string): Promise<void>;
}

export const EMAIL_TEMPLATE_REPOSITORY = Symbol('EMAIL_TEMPLATE_REPOSITORY');
