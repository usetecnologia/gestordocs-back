import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
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
}
