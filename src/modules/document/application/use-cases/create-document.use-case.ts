import { Inject, Injectable } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { CreateDocumentDto } from '../../infrastructure/http/dtos/create-document.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Document } from '../../domain/document.entity';
import { assertProgramsAreValid } from '../validators/document-programs.validator';
import { assertAiConfigIsValid } from '../validators/document-ai-config.validator';

@Injectable()
export class CreateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(dto: CreateDocumentDto, user: JwtPayload): Promise<Document> {
    assertAiConfigIsValid({
      type: dto.type,
      aiEnabled: dto.aiEnabled ?? false,
      aiProfile: dto.aiProfile ?? null,
    });
    await assertProgramsAreValid(dto.programs ?? [], this.repo);

    return this.repo.create({ ...dto, createdById: user.sub });
  }
}
