import { Injectable } from '@nestjs/common';
import { Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IEmailTemplateRepository,
  EmailTemplateFilters,
  CreateEmailTemplateData,
  UpdateEmailTemplateData,
  ActiveTemplateConflictError,
} from '../../domain/email-template.repository';
import { EmailTemplate, EmailTemplateSchedule } from '../../domain/email-template.entity';
import { EmailTemplateType } from '../../domain/email-template.enums';
import {
  EmailTemplateMapper,
  EMAIL_TEMPLATE_FULL_INCLUDE,
  PrismaEmailTemplateFull,
} from './email-template.mapper';

function scheduleToJson(schedule: EmailTemplateSchedule | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!schedule) return Prisma.JsonNull;
  return schedule as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class EmailTemplatePrismaRepository implements IEmailTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, search, status }: EmailTemplateFilters): Promise<{
    data: EmailTemplate[];
    total: number;
  }> {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
          { subject: { contains: search } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.emailTemplate.findMany({
        where,
        include: EMAIL_TEMPLATE_FULL_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.emailTemplate.count({ where }),
    ]);

    return { data: (data as PrismaEmailTemplateFull[]).map(EmailTemplateMapper.toDomain), total };
  }

  async findById(id: string): Promise<EmailTemplate | null> {
    const row = await this.prisma.emailTemplate.findUnique({
      where: { id },
      include: EMAIL_TEMPLATE_FULL_INCLUDE,
    });
    return row ? EmailTemplateMapper.toDomain(row as PrismaEmailTemplateFull) : null;
  }

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.emailTemplate.findFirst({
      where: { code, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async hasActiveTemplateForAction(actionId: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.emailTemplate.findFirst({
      where: { actionId, status: true, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async findActiveByActionId(actionId: string): Promise<EmailTemplate | null> {
    const row = await this.prisma.emailTemplate.findFirst({
      where: { actionId, status: true },
      include: EMAIL_TEMPLATE_FULL_INCLUDE,
    });
    return row ? EmailTemplateMapper.toDomain(row as PrismaEmailTemplateFull) : null;
  }

  async findAllActiveProgramada(): Promise<EmailTemplate[]> {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { status: true, type: EmailTemplateType.PROGRAMADA },
      include: EMAIL_TEMPLATE_FULL_INCLUDE,
    });
    return (rows as PrismaEmailTemplateFull[]).map(EmailTemplateMapper.toDomain);
  }

  async create(data: CreateEmailTemplateData): Promise<EmailTemplate> {
    const { schedule, createdById, ...fields } = data;
    const willBeActive = fields.status !== false;

    const row = await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila de la acción hasta que la transacción termine: si otra petición
      // está creando/activando una plantilla para la MISMA acción al mismo tiempo, queda
      // en espera aquí y recién ve el conteo real una vez que esta transacción confirma.
      await tx.$queryRaw`SELECT id FROM acciones_correo WHERE id = ${fields.actionId} FOR UPDATE`;

      if (willBeActive) {
        const activeCount = await tx.emailTemplate.count({
          where: { actionId: fields.actionId, status: true },
        });
        if (activeCount > 0) throw new ActiveTemplateConflictError(fields.actionId);
      }

      return tx.emailTemplate.create({
        data: {
          ...fields,
          schedule: scheduleToJson(schedule),
          ...(createdById && { createdById }),
        },
        include: EMAIL_TEMPLATE_FULL_INCLUDE,
      });
    });

    return EmailTemplateMapper.toDomain(row as PrismaEmailTemplateFull);
  }

  async update(id: string, data: UpdateEmailTemplateData): Promise<EmailTemplate> {
    const { schedule, updatedById, ...fields } = data;

    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.emailTemplate.findUniqueOrThrow({
        where: { id },
        select: { actionId: true, status: true },
      });
      const effectiveActionId = fields.actionId ?? current.actionId;
      const effectiveStatus = fields.status !== undefined ? fields.status : current.status;

      await tx.$queryRaw`SELECT id FROM acciones_correo WHERE id = ${effectiveActionId} FOR UPDATE`;

      if (effectiveStatus) {
        const activeCount = await tx.emailTemplate.count({
          where: { actionId: effectiveActionId, status: true, id: { not: id } },
        });
        if (activeCount > 0) throw new ActiveTemplateConflictError(effectiveActionId);
      }

      return tx.emailTemplate.update({
        where: { id },
        data: {
          ...fields,
          ...(schedule !== undefined && { schedule: scheduleToJson(schedule) }),
          ...(updatedById !== undefined && { updatedById }),
        },
        include: EMAIL_TEMPLATE_FULL_INCLUDE,
      });
    });

    return EmailTemplateMapper.toDomain(row as PrismaEmailTemplateFull);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.emailTemplate.delete({ where: { id } });
  }
}
