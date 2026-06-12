import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Pasaporte' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: TypeDocument })
  @IsOptional()
  @IsEnum(TypeDocument)
  type?: TypeDocument;

  @ApiPropertyOptional({ example: 'pdf,jpg,png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  formats?: string;

  @ApiPropertyOptional({ enum: TypeHired })
  @IsOptional()
  @IsEnum(TypeHired)
  showHired?: TypeHired;

  @ApiPropertyOptional({ example: 'El documento debe estar vigente y en buen estado.' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  instructions?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Reemplaza completamente los sponsors asociados. Enviar array vacío para desvincular todos.',
    example: ['uuid-sponsor-1'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sponsorIds?: string[];
}
