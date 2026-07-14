import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';

@Injectable()
export class DeleteEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly repo: IEmailTemplateRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Plantilla #${id} no encontrada.`);
    await this.repo.delete(id);
  }
}
