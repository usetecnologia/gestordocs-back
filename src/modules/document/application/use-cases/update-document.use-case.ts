import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  IDocumentRepository,
  findDuplicateCountryIds,
  findDuplicateProgramIds,
} from '../../domain/document.repository';
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

    if (dto.programs?.length) {
      const duplicatePrograms = findDuplicateProgramIds(dto.programs);
      if (duplicatePrograms.length > 0) {
        throw new ConflictException(
          `Programa(s) duplicado(s) en la solicitud: ${duplicatePrograms.join(', ')}.`,
        );
      }
      for (const program of dto.programs) {
        const duplicateCountries = findDuplicateCountryIds(program);
        if (duplicateCountries.length > 0) {
          throw new ConflictException(
            `El(los) país(es) ${duplicateCountries.join(', ')} no puede(n) tener más de una descripción para el mismo programa.`,
          );
        }
      }
    }

    return this.repo.update(id, { ...dto, updatedById: user.sub });
  }
}
