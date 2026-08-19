import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';

export class FindDocumentsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: TypeDocument })
  @IsOptional()
  @IsEnum(TypeDocument)
  type?: TypeDocument;

  @ApiPropertyOptional({ enum: TypeHired })
  @IsOptional()
  @IsEnum(TypeHired)
  showHired?: TypeHired;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key as string];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    example: 'pasaporte',
    description: 'Busca coincidencias parciales en el nombre o en las siglas del documento.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Devuelve solo los documentos vinculados explícitamente a este sponsor. Los documentos ' +
      'generales (sin ningún sponsor) NO se incluyen, aunque en la práctica se le pidan a todos.',
  })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({ description: 'Devuelve solo los documentos asociados a este programa.' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({
    description:
      'Devuelve solo los documentos que tienen al menos una descripción configurada para este ' +
      'país, en cualquiera de sus programas.',
  })
  @IsOptional()
  @IsUUID()
  countryId?: string;
}
