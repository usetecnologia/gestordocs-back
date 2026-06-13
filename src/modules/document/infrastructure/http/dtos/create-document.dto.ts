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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';

export class DocumentSponsorInputDto {
  @ApiProperty({ example: 'uuid-sponsor' })
  @IsUUID()
  sponsorId!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateDocumentDto {
  @ApiProperty({ example: 'Pasaporte Vigente' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

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

  @ApiPropertyOptional({
    type: [DocumentSponsorInputDto],
    description: 'Sponsors a asociar al documento con su flag de requerido',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentSponsorInputDto)
  sponsors?: DocumentSponsorInputDto[];
}
