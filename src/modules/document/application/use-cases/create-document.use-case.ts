import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  DOCUMENT_REPOSITORY,
  IDocumentRepository,
  findDuplicateCountryIds,
  findDuplicateProgramIds,
} from '../../domain/document.repository';
import type { CreateDocumentDto } from '../../infrastructure/http/dtos/create-document.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import type { Document } from '../../domain/document.entity';

@Injectable()
export class CreateDocumentUseCase {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly repo: IDocumentRepository,
  ) {}

  execute(dto: CreateDocumentDto, user: JwtPayload): Promise<Document> {
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

    return this.repo.create({ ...dto, createdById: user.sub });
  }
}
