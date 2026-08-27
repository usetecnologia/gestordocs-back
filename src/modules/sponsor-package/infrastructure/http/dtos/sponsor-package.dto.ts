import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from '../../../domain/sponsor-package.enums';
import { toIdList } from '@common/utils/query-list.util';

/** El select de alcance manda '' cuando el admin elige "Todos". Se normaliza a null, no a undefined. */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

const stringToBoolean = ({ obj, key }: { obj: unknown; key: string }) => {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
};

// ---------------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------------

export class FindSponsorPackagesQueryDto {
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

  @ApiPropertyOptional({ description: 'Busca en el nombre del paquete y en el código/nombre del sponsor.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID() sponsorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() programId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() countryId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: 'uuid-sponsor-1,uuid-sponsor-2',
    description:
      'Uno o varios sponsors, separados por coma. Si se envía, tiene prioridad sobre `sponsorId`.',
  })
  @IsOptional()
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @IsUUID('all', { each: true })
  sponsorIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: 'uuid-pais-1,uuid-pais-2',
    description:
      'Uno o varios países, separados por coma. Si se envía, tiene prioridad sobre `countryId`.',
  })
  @IsOptional()
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @IsUUID('all', { each: true })
  countryIds?: string[];

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({ enum: PackageStructure })
  @IsOptional()
  @IsEnum(PackageStructure)
  structure?: PackageStructure;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export class SponsorPackageStampInputDto {
  @ApiProperty({ description: 'URL en S3 del PNG del sello. Se obtiene de POST /stamp-asset.' })
  @IsString()
  @MaxLength(1000)
  assetUrl!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Estampa solo sobre las páginas que aportó este documento. Enviar null para estampar todas.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  onlyDocumentId?: string | null;

  @ApiProperty({ example: 120 }) @IsInt() @Min(1) @Max(2000) widthPt!: number;
  @ApiProperty({ example: 20 }) @IsInt() @Min(0) @Max(2000) marginXPt!: number;
  @ApiProperty({ example: 90 }) @IsInt() @Min(0) @Max(2000) marginYPt!: number;

  @ApiProperty({ enum: PackageStampAnchor })
  @IsEnum(PackageStampAnchor)
  anchor!: PackageStampAnchor;
}

export class SponsorPackageSourceInputDto {
  @ApiPropertyOptional({ nullable: true, description: 'Documento del participante. Excluyente con inputSlug.' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  documentId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Adjunto declarado en `inputs`. Excluyente con documentId.' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(60)
  inputSlug?: string | null;

  @ApiProperty({ example: 0, description: 'Posición dentro del archivo. Define el orden de combinado.' })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiProperty({ enum: PackageOnMissing, description: 'Qué hacer si el participante no tiene esta fuente.' })
  @IsEnum(PackageOnMissing)
  onMissing!: PackageOnMissing;
}

export class SponsorPackageOutputInputDto {
  @ApiProperty({ example: 'ULETTER', description: 'Sin extensión: la pone el modo.' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(/^[^\\/:*?"<>|]+$/, { message: 'El nombre del archivo no puede tener \\ / : * ? " < > |' })
  filename!: string;

  @ApiProperty({ enum: PackageOutputMode })
  @IsEnum(PackageOutputMode)
  mode!: PackageOutputMode;

  @ApiProperty({ example: 0 }) @IsInt() @Min(0) order!: number;

  @ApiProperty({
    example: false,
    description: 'Emite el archivo aunque ninguna fuente aporte páginas.',
  })
  @IsBoolean()
  emitWhenEmpty!: boolean;

  @ApiProperty({ type: [SponsorPackageSourceInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SponsorPackageSourceInputDto)
  sources!: SponsorPackageSourceInputDto[];

  @ApiProperty({ type: [SponsorPackageStampInputDto], default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SponsorPackageStampInputDto)
  stamps!: SponsorPackageStampInputDto[];
}

export class SponsorPackageInputInputDto {
  @ApiProperty({ example: 'vacationLetter', description: 'Nombre del campo en el multipart.' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
    message: 'El identificador del adjunto debe empezar con letra y usar solo letras, números, guion y guion bajo',
  })
  slug!: string;

  @ApiProperty({ example: 'Vacation Letter' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  label!: string;

  @ApiProperty({ example: true }) @IsBoolean() required!: boolean;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiProperty({ example: 10 }) @IsInt() @Min(1) @Max(100) maxSizeMb!: number;

  @ApiProperty({ example: true, description: 'Sube el archivo a S3 como constancia.' })
  @IsBoolean()
  archiveToS3!: boolean;

  @ApiPropertyOptional({ nullable: true, example: 'aag-vacation-letters' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  s3Folder?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'VacationLetter.pdf' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(150)
  archiveFilename?: string | null;
}

export class CreateSponsorPackageDto {
  @ApiProperty({ example: 'UNITED — estándar' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty() @IsUUID() sponsorId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'null = aplica a todos los programas.' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  programId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = aplica a todos los países.' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  countryId?: string | null;

  @ApiProperty({ enum: PackageStructure })
  @IsEnum(PackageStructure)
  structure!: PackageStructure;

  @ApiProperty({
    example: '{PROGRAMA}/{PAIS}/{SPONSOR}',
    description: 'Tokens: {dni} {apellidos} {nombres} {nombreCompleto} {sponsor} {programa} {pais}',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  folderPathTemplate!: string;

  @ApiProperty({ example: '{dni} - {apellidos}, {nombres}' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  itemNameTemplate!: string;

  @ApiPropertyOptional({ example: 'SIN PROGRAMA' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fallbackPrograma?: string;

  @ApiPropertyOptional({ example: 'SIN PAIS' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  fallbackPais?: string;

  @ApiPropertyOptional({ example: 0, description: 'Desempate a igual especificidad. Mayor gana.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiProperty({ type: [SponsorPackageOutputInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SponsorPackageOutputInputDto)
  outputs!: SponsorPackageOutputInputDto[];

  @ApiProperty({ type: [SponsorPackageInputInputDto], default: [] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SponsorPackageInputInputDto)
  inputs!: SponsorPackageInputInputDto[];
}

export class UpdateSponsorPackageDto extends CreateSponsorPackageDto {
  @ApiPropertyOptional({ example: true, description: 'Activa o desactiva la regla.' })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}

export class DuplicateSponsorPackageDto {
  @ApiProperty({ example: 'UNITED — Intern' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;
}

export class OutputOrderItemDto {
  @ApiProperty() @IsUUID() outputId!: string;
  @ApiProperty({ example: 0 }) @IsInt() @Min(0) order!: number;
}

export class UpdateOutputsOrderDto {
  @ApiProperty({ type: [OutputOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OutputOrderItemDto)
  orders!: OutputOrderItemDto[];
}

export class PreviewSponsorPackageDto {
  @ApiProperty({ example: '71234567' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  dni!: string;

  @ApiPropertyOptional({
    description:
      'Fuerza a probar este paquete. Sin él se resuelve por el sponsor del participante, que es ' +
      'lo que haría la descarga real.',
  })
  @IsOptional()
  @IsUUID()
  packageId?: string;
}

export class FindRequiredInputsQueryDto {
  @ApiProperty({
    example: 'AAG,UNITED',
    description: 'Códigos de sponsor separados por coma. Vacío devuelve lista vacía.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((c) => c.trim()).filter(Boolean)
      : Array.isArray(value)
        ? value
        : [],
  )
  @IsArray()
  @IsString({ each: true })
  sponsorCodes!: string[];
}
