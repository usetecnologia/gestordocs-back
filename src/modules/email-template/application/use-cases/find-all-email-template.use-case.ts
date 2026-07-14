import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  IEmailTemplateRepository,
} from '../../domain/email-template.repository';
import type { FindEmailTemplatesQueryDto } from '../../infrastructure/http/dtos/find-email-templates-query.dto';
import type { EmailTemplate } from '../../domain/email-template.entity';

@Injectable()
export class FindAllEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly repo: IEmailTemplateRepository,
  ) {}

  execute(query: FindEmailTemplatesQueryDto): Promise<{ data: EmailTemplate[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      status: query.status,
    });
  }
}
