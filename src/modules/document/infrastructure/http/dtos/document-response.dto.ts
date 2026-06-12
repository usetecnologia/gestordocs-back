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
  @ApiProperty() status!: boolean;
}

export class DocumentResponseDto {
  @ApiProperty({ example: 'uuid-del-documento' }) id!: string;
  @ApiProperty({ example: 'Pasaporte' }) name!: string;
  @ApiProperty({ enum: TypeDocument }) type!: TypeDocument;
  @ApiPropertyOptional({ example: 'pdf,jpg,png' }) formats!: string | null;
  @ApiProperty({ enum: TypeHired }) showHired!: TypeHired;
  @ApiProperty({ example: 'El documento debe estar vigente.' }) instructions!: string;
  @ApiProperty({ example: true }) required!: boolean;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) createdById!: string | null;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) updatedById!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [DocumentSponsorItemDto] }) sponsors!: DocumentSponsorItemDto[];
  @ApiPropertyOptional({ type: UserRefDto }) createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto }) updatedBy!: UserRefDto | null;
}
