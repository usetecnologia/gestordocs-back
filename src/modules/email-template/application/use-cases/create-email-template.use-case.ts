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
import type { CreateEmailTemplateDto } from '../../infrastructure/http/dtos/create-email-template.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { EmailTemplate } from '../../domain/email-template.entity';

@Injectable()
export class CreateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly repo: IEmailTemplateRepository,
    @Inject(EMAIL_ACTION_REPOSITORY) private readonly actionRepo: IEmailActionRepository,
  ) {}

  async execute(dto: CreateEmailTemplateDto, user: JwtPayload): Promise<EmailTemplate> {
    const action = await this.actionRepo.findById(dto.actionId);
    if (!action || !action.status) {
      throw new NotFoundException(`Acción de correo #${dto.actionId} no encontrada o inactiva.`);
    }

    if (await this.repo.isCodeTaken(dto.code)) {
      throw new ConflictException(`El código "${dto.code}" ya está en uso.`);
    }

    assertKnownTemplateVariables(dto.subject, dto.htmlContent);

    if (dto.type === EmailTemplateType.NORMAL && dto.schedule) {
      throw new BadRequestException('No se debe enviar schedule cuando type es NORMAL.');
    }

    if (await this.repo.hasActiveTemplateForAction(dto.actionId)) {
      throw new ConflictException(
        'Ya existe una plantilla activa para esta acción. Desactívala antes de crear otra.',
      );
    }

    try {
      return await this.repo.create({
        name: dto.name,
        code: dto.code,
        subject: dto.subject,
        htmlContent: dto.htmlContent,
        type: dto.type,
        actionId: dto.actionId,
        schedule: dto.type === EmailTemplateType.PROGRAMADA ? (dto.schedule ?? null) : null,
        createdById: user.sub,
      });
    } catch (error) {
      if (error instanceof ActiveTemplateConflictError) {
        throw new ConflictException(
          'Ya existe una plantilla activa para esta acción. Desactívala antes de crear otra.',
        );
      }
      throw error;
    }
  }
}
