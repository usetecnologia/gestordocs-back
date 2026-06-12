import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DOCUMENT_REPOSITORY, IDocumentRepository } from '../../domain/document.repository';
import type { UpdateDocumentDto } from '../../infrastructure/http/dtos/update-document.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class UpdateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  async execute(id: string, dto: UpdateDocumentDto, user: JwtPayload): Promise<Document> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Documento #${id} no encontrado.`);
    return this.repo.update(id, { ...dto, updatedById: user.sub });
  }
}
