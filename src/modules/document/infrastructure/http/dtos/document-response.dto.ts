import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TypeDocument, TypeHired } from '../../../domain/document.enums';

class UserRefDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() username!: string | null;
  @ApiPropertyOptional() email!: string | null;
}

class SponsorRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class DocumentSponsorItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() sponsorId!: string;
  @ApiProperty({ type: SponsorRefDto }) sponsor!: SponsorRefDto;
  @ApiProperty({ example: false }) required!: boolean;
  @ApiProperty({ example: 1 }) order!: number;
  @ApiProperty() status!: boolean;
}

class ProgramRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class CountryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class DocumentProgramDescriptionCountryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() countryId!: string;
  @ApiProperty({ type: CountryRefDto }) country!: CountryRefDto;
}

class DocumentProgramDescriptionItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ example: 0 }) order!: number;
  @ApiProperty({ type: [DocumentProgramDescriptionCountryItemDto] })
  countries!: DocumentProgramDescriptionCountryItemDto[];
}

class TemporadaRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Una temporada desactivada sigue viajando si ya estaba asignada.' })
  status!: boolean;
}

class DocumentProgramItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() programId!: string;
  @ApiProperty({ type: ProgramRefDto }) program!: ProgramRefDto;
  @ApiProperty({ nullable: true, example: 'uuid-temporada' }) temporadaId!: string | null;
  @ApiProperty({ type: TemporadaRefDto, nullable: true }) temporada!: TemporadaRefDto | null;
  @ApiProperty() status!: boolean;
  @ApiProperty({ type: [DocumentProgramDescriptionItemDto] })
  descriptions!: DocumentProgramDescriptionItemDto[];
}

export class DocumentResponseDto {
  @ApiProperty({ example: 'uuid-del-documento' }) id!: string;
  @ApiPropertyOptional({ example: 'Pasaporte Vigente' }) title!: string | null;
  @ApiProperty({ example: 'Pasaporte' }) name!: string;
  @ApiProperty({ enum: TypeDocument }) type!: TypeDocument;
  @ApiPropertyOptional({ example: 'pdf,jpg,png' }) formats!: string | null;
  @ApiProperty({ enum: TypeHired }) showHired!: TypeHired;
  @ApiPropertyOptional({ example: 'PAS' }) siglasCode!: string | null;
  @ApiPropertyOptional({ example: 'El documento debe estar vigente.' }) instructions!: string | null;
  @ApiPropertyOptional({ example: 1 }) order!: number | null;
  @ApiProperty({ example: false }) required!: boolean;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) createdById!: string | null;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) updatedById!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [DocumentSponsorItemDto] }) sponsors!: DocumentSponsorItemDto[];
  @ApiProperty({ type: [DocumentProgramItemDto] }) programs!: DocumentProgramItemDto[];
  @ApiPropertyOptional({ type: UserRefDto }) createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto }) updatedBy!: UserRefDto | null;
}

export class DocumentCountryResponseDto {
  @ApiProperty({ example: 'uuid-del-pais' }) id!: string;
  @ApiProperty({ example: 'PE' }) code!: string;
  @ApiProperty({ example: 'Perú' }) name!: string;
}
