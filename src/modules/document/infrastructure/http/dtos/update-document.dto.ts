import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';
import { DocumentSponsorInputDto } from './create-document.dto';

export class UpdateDocumentDto {
  @ApiProperty({ example: 'Pasaporte Vigente' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

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

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    type: [DocumentSponsorInputDto],
    description:
      'Reemplaza completamente los sponsors asociados. Enviar array vacío para desvincular todos.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentSponsorInputDto)
  sponsors?: DocumentSponsorInputDto[];
}
