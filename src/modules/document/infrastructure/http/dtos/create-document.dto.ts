import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateDocumentDto {
  @ApiProperty({ example: 'Pasaporte' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: TypeDocument })
  @IsEnum(TypeDocument)
  type!: TypeDocument;

  @ApiPropertyOptional({
    example: 'pdf,jpg,png',
    description: 'Formatos de archivo permitidos, separados por coma',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  formats?: string;

  @ApiProperty({ enum: TypeHired })
  @IsEnum(TypeHired)
  showHired!: TypeHired;

  @ApiProperty({ example: 'El documento debe estar vigente y en buen estado.' })
  @IsString()
  @MinLength(5)
  instructions!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  required!: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs de los sponsors a asociar al documento',
    example: ['uuid-sponsor-1', 'uuid-sponsor-2'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sponsorIds?: string[];
}
