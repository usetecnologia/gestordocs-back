import type { Prisma } from 'prisma/generated/prisma/client';
import { EmailTemplate, EmailTemplateSchedule } from '../../domain/email-template.entity';
import { EmailTemplateType } from '../../domain/email-template.enums';

export const EMAIL_TEMPLATE_FULL_INCLUDE = {
  action: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, username: true, email: true } },
  updatedBy: { select: { id: true, username: true, email: true } },
} satisfies Prisma.EmailTemplateInclude;

export type PrismaEmailTemplateFull = Prisma.EmailTemplateGetPayload<{
  include: typeof EMAIL_TEMPLATE_FULL_INCLUDE;
}>;

export class EmailTemplateMapper {
  static toDomain(raw: PrismaEmailTemplateFull): EmailTemplate {
    return new EmailTemplate(
      raw.id,
      raw.name,
      raw.code,
      raw.subject,
      raw.htmlContent,
      raw.status,
      raw.type as unknown as EmailTemplateType,
      raw.actionId,
      (raw.schedule as unknown as EmailTemplateSchedule | null) ?? null,
      raw.createdById,
      raw.updatedById,
      raw.createdAt,
      raw.updatedAt,
      raw.action,
      raw.createdBy,
      raw.updatedBy,
    );
  }
}
