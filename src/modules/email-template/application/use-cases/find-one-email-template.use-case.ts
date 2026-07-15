import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';
import type { EmailTemplate } from '../../domain/email-template.entity';

@Injectable()
export class FindOneEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly repo: IEmailTemplateRepository,
  ) {}

  async execute(id: string): Promise<EmailTemplate> {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException(`Plantilla #${id} no encontrada.`);
    return found;
  }
}
