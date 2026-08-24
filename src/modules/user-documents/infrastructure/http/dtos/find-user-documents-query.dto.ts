import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { UserDocumentFilter } from '../../../domain/user-documents.repository';

export class FindUserDocumentsQueryDto {
  @ApiPropertyOptional({
    enum: UserDocumentFilter,
    default: UserDocumentFilter.ALL,
    description: 'ALL: todos | REQUIRED: obligatorios | OBSERVED: observados',
  })
  @IsOptional()
  @IsEnum(UserDocumentFilter)
  filter?: UserDocumentFilter;

  /**
   * Acota el expediente a un ciclo del participante, para revisar uno archivado. Va declarado acá y
   * no como `@Query('procesoId')` suelto porque el `ValidationPipe` global corre con
   * `forbidNonWhitelisted`: una propiedad que no esté en el DTO hace fallar toda la consulta con
   * "property procesoId should not exist".
   */
  @ApiPropertyOptional({
    description:
      'Acota el expediente a un ciclo del participante. Con este parámetro no se sincroniza: un ' +
      'ciclo cerrado está congelado.',
  })
  @IsOptional()
  @IsUUID()
  procesoId?: string;
}
