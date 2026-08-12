import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class FindDocumentsBySponsorQueryDto {
  @ApiPropertyOptional({
    example: 'uuid-sponsor-1,uuid-sponsor-2',
    description:
      'IDs de sponsors separados por coma. Si se omite, se devuelven solo los documentos generales.',
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sponsorIds: string[] = [];
}
