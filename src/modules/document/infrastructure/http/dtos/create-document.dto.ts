import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';

export const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

export class DocumentSponsorInputDto {
  @ApiProperty({ example: 'uuid-sponsor' })
  @IsUUID()
  sponsorId!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiProperty({ example: 1, description: 'Posición del sponsor dentro del documento' })
  @IsInt()
  @Min(0)
  order!: number;
}

export class DocumentProgramDescriptionInputDto {
  @ApiProperty({ example: 'Formulario DS-2019' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Debe presentar el formulario DS-2019 ante la embajada.' })
  @IsString()
  @MinLength(2)
  description!: string;

  @ApiProperty({
    type: [String],
    example: ['uuid-pais-peru', 'uuid-pais-argentina'],
    description: 'Países a los que aplica esta descripción, dentro del programa',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  countryIds!: string[];
}

export class DocumentProgramInputDto {
  @ApiProperty({ example: 'uuid-programa' })
  @IsUUID()
  programId!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({
    type: [DocumentProgramDescriptionInputDto],
    description:
      'Grupos de descripción para este programa. Cada grupo tiene un texto y los países a los que aplica; un país no puede repetirse en dos grupos del mismo programa.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentProgramDescriptionInputDto)
  descriptions?: DocumentProgramDescriptionInputDto[];
}

export class CreateDocumentDto {
  @ApiPropertyOptional({ example: 'Pasaporte Vigente' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

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

  @ApiPropertyOptional({ example: 'PAS', description: 'Código de siglas del documento' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  siglasCode?: string;

  @ApiPropertyOptional({ example: 'El documento debe estar vigente y en buen estado.' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(5)
  instructions?: string;

  @ApiPropertyOptional({ example: false, default: false, description: 'Indica si el documento es obligatorio' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: true, default: true, description: 'Estado activo/inactivo del documento al crearlo' })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({ example: 1, description: 'Orden de presentación del documento' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    type: [DocumentSponsorInputDto],
    description: 'Sponsors a asociar al documento con su flag de requerido y orden',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentSponsorInputDto)
  sponsors?: DocumentSponsorInputDto[];

  @ApiPropertyOptional({
    type: [DocumentProgramInputDto],
    description: 'Programas a asociar al documento, con sus grupos de descripción por país',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentProgramInputDto)
  programs?: DocumentProgramInputDto[];
}
