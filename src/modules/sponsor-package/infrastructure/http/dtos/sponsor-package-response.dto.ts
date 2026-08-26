import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PackageOnMissing,
  PackageOutputMode,
  PackageStampAnchor,
  PackageStructure,
} from '../../../domain/sponsor-package.enums';

export class SponsorPackageListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'UNITED — estándar' }) name!: string;
  @ApiProperty() sponsorId!: string;
  @ApiProperty({ example: 'UNITED' }) sponsorCode!: string;
  @ApiProperty() sponsorName!: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = todos los programas.' }) programId!: string | null;
  @ApiPropertyOptional({ nullable: true }) programName!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'null = todos los países.' }) countryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) countryName!: string | null;
  @ApiProperty({ enum: PackageStructure }) structure!: PackageStructure;
  @ApiProperty({ example: 5 }) outputCount!: number;
  @ApiProperty({ example: 0 }) inputCount!: number;
  @ApiProperty({ example: 0 }) priority!: number;
  @ApiProperty() status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class SponsorPackageStampDto {
  @ApiProperty() id!: string;
  @ApiProperty() assetUrl!: string;
  @ApiPropertyOptional({ nullable: true }) onlyDocumentId!: string | null;
  @ApiProperty() widthPt!: number;
  @ApiProperty() marginXPt!: number;
  @ApiProperty() marginYPt!: number;
  @ApiProperty({ enum: PackageStampAnchor }) anchor!: PackageStampAnchor;
}

export class SponsorPackageSourceDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) documentId!: string | null;
  @ApiPropertyOptional({ nullable: true }) inputId!: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'ULETTER' }) documentSiglasCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentName!: string | null;
  @ApiPropertyOptional({ nullable: true, example: 'vacationLetter' }) inputSlug!: string | null;
  @ApiProperty() order!: number;
  @ApiProperty({ enum: PackageOnMissing }) onMissing!: PackageOnMissing;
}

export class SponsorPackageOutputDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ULETTER' }) filename!: string;
  @ApiProperty({ enum: PackageOutputMode }) mode!: PackageOutputMode;
  @ApiProperty() order!: number;
  @ApiProperty() emitWhenEmpty!: boolean;
  @ApiProperty({ type: [SponsorPackageSourceDto] }) sources!: SponsorPackageSourceDto[];
  @ApiProperty({ type: [SponsorPackageStampDto] }) stamps!: SponsorPackageStampDto[];
}

export class SponsorPackageInputDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'vacationLetter' }) slug!: string;
  @ApiProperty({ example: 'Vacation Letter' }) label!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty({ example: 'application/pdf' }) mimeType!: string;
  @ApiProperty({ example: 10 }) maxSizeMb!: number;
  @ApiProperty() archiveToS3!: boolean;
  @ApiPropertyOptional({ nullable: true }) s3Folder!: string | null;
  @ApiPropertyOptional({ nullable: true }) archiveFilename!: string | null;
}

export class SponsorPackageDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sponsorId!: string;
  @ApiProperty({ example: 'UNITED' }) sponsorCode!: string;
  @ApiPropertyOptional({ nullable: true }) programId!: string | null;
  @ApiPropertyOptional({ nullable: true }) countryId!: string | null;
  @ApiProperty({ enum: PackageStructure }) structure!: PackageStructure;
  @ApiProperty({ example: '{PROGRAMA}/{PAIS}/{SPONSOR}' }) folderPathTemplate!: string;
  @ApiProperty({ example: '{dni} - {apellidos}, {nombres}' }) itemNameTemplate!: string;
  @ApiProperty({ example: 'SIN PROGRAMA' }) fallbackPrograma!: string;
  @ApiProperty({ example: 'SIN PAIS' }) fallbackPais!: string;
  @ApiProperty() priority!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: [SponsorPackageOutputDto] }) outputs!: SponsorPackageOutputDto[];
  @ApiProperty({ type: [SponsorPackageInputDto] }) inputs!: SponsorPackageInputDto[];
}

export class StampAssetResponseDto {
  @ApiProperty({ example: 'https://bucket.s3.us-east-1.amazonaws.com/sponsor-package-stamps/uuid.png' })
  url!: string;
}

// --- Preview ---

export class PreviewSourceDto {
  @ApiProperty({ example: 'ULETTER' }) label!: string;
  @ApiProperty() incluido!: boolean;
  @ApiProperty({ example: 'Le corresponde pero no lo tiene subido.' }) motivo!: string;
}

export class PreviewFileDto {
  @ApiProperty({ example: 'WAT USA/PERU/UNITED/71234567 - PEREZ QUISPE, MARIA/ULETTER.pdf' })
  path!: string;
  @ApiProperty() emitido!: boolean;
  @ApiPropertyOptional({ nullable: true }) motivo!: string | null;
  @ApiProperty({ type: [PreviewSourceDto] }) sources!: PreviewSourceDto[];
}

export class PreviewParticipanteDto {
  @ApiProperty() dni!: string;
  @ApiProperty() nombreCompleto!: string;
  @ApiPropertyOptional({ nullable: true }) sponsorCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) programa!: string | null;
  @ApiPropertyOptional({ nullable: true }) pais!: string | null;
  @ApiProperty() tieneProcesoAbierto!: boolean;
}

export class PreviewPaqueteDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sponsorCode!: string;
  @ApiProperty({ enum: PackageStructure }) structure!: PackageStructure;
}

export class PreviewResponseDto {
  @ApiProperty({ type: PreviewPaqueteDto }) paquete!: PreviewPaqueteDto;
  @ApiProperty({ type: PreviewParticipanteDto }) participante!: PreviewParticipanteDto;
  @ApiProperty({ example: 'WAT USA/PERU/UNITED' }) groupPath!: string;
  @ApiProperty({ example: '71234567 - PEREZ QUISPE, MARIA LUCIA' }) itemName!: string;
  @ApiProperty({ type: [PreviewFileDto] }) archivos!: PreviewFileDto[];
  @ApiPropertyOptional({ nullable: true, description: 'Motivo por el que quedaría fuera. null = se arma.' })
  skipParticipant!: string | null;
  @ApiProperty({ type: [String] }) adjuntosRequeridos!: string[];
}

/** Lo que el que descarga necesita saber de un adjunto. No incluye la configuración de archivado. */
export class RequiredInputDto {
  @ApiProperty({ example: 'vacationLetter' }) slug!: string;
  @ApiProperty({ example: 'Vacation Letter' }) label!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty({ example: 'application/pdf' }) mimeType!: string;
  @ApiProperty({ example: 10 }) maxSizeMb!: number;
  @ApiProperty({ type: [String], example: ['AAG'] }) sponsorCodes!: string[];
}

export class DownloadRequirementsDto {
  @ApiProperty({
    type: [String],
    example: ['AAG', 'UNITED'],
    description: 'De los sponsors consultados, los que tienen un paquete de descarga activo.',
  })
  sponsorsWithPackage!: string[];

  @ApiProperty({ type: [RequiredInputDto] })
  inputs!: RequiredInputDto[];
}
