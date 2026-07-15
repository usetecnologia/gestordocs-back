import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EMAIL_ACTION_REPOSITORY,
  IEmailActionRepository,
} from '@modules/email-action/domain/email-action.repository';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
  ActiveTemplateConflictError,
} from '../../domain/email-template.repository';
import { assertKnownTemplateVariables } from '@common/utils/template-variables.util';
import { EmailTemplateType } from '../../domain/email-template.enums';
import type { UpdateEmailTemplateDto } from '../../infrastructure/http/dtos/update-email-template.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { EmailTemplate } from '../../domain/email-template.entity';

@Injectable()
export class UpdateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly repo: IEmailTemplateRepository,
    @Inject(EMAIL_ACTION_REPOSITORY) private readonly actionRepo: IEmailActionRepository,
  ) {}

  async execute(id: string, dto: UpdateEmailTemplateDto, user: JwtPayload): Promise<EmailTemplate> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Plantilla #${id} no encontrada.`);

    if (dto.actionId && dto.actionId !== existing.actionId) {
      const action = await this.actionRepo.findById(dto.actionId);
      if (!action || !action.status) {
        throw new NotFoundException(`Acción de correo #${dto.actionId} no encontrada o inactiva.`);
      }
    }

    if (dto.code && dto.code !== existing.code && (await this.repo.isCodeTaken(dto.code, id))) {
      throw new ConflictException(`El código "${dto.code}" ya está en uso.`);
    }

    const effectiveActionId = dto.actionId ?? existing.actionId;
    const effectiveType = dto.type ?? existing.type;
    const effectiveStatus = dto.status ?? existing.status;
    const effectiveSchedule = dto.schedule !== undefined ? (dto.schedule ?? null) : existing.schedule;

    assertKnownTemplateVariables(dto.subject ?? existing.subject, dto.htmlContent ?? existing.htmlContent);

    if (effectiveType === EmailTemplateType.NORMAL && effectiveSchedule) {
      throw new BadRequestException('No se debe enviar schedule cuando type es NORMAL.');
    }
    if (effectiveType === EmailTemplateType.PROGRAMADA && !effectiveSchedule) {
      throw new BadRequestException('schedule es obligatorio cuando type es PROGRAMADA.');
    }

    if (effectiveStatus && (await this.repo.hasActiveTemplateForAction(effectiveActionId, id))) {
      throw new ConflictException(
        'Ya existe una plantilla activa para esta acción. Desactívala antes de activar/asociar esta.',
      );
    }

    try {
      return await this.repo.update(id, {
        name: dto.name,
        code: dto.code,
        subject: dto.subject,
        htmlContent: dto.htmlContent,
        type: dto.type,
        actionId: dto.actionId,
        status: dto.status,
        schedule: effectiveType === EmailTemplateType.PROGRAMADA ? effectiveSchedule : null,
        updatedById: user.sub,
      });
    } catch (error) {
      if (error instanceof ActiveTemplateConflictError) {
        throw new ConflictException(
          'Ya existe una plantilla activa para esta acción. Desactívala antes de activar/asociar esta.',
        );
      }
      throw error;
    }
  }
}
