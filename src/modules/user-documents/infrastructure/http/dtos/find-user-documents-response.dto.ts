import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserDocumentDocumentInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() title!: string;
  @ApiProperty() type!: string;
  @ApiPropertyOptional({ nullable: true }) instructions!: string | null;
  @ApiProperty() required!: boolean;
  @ApiPropertyOptional({ nullable: true, example: 1 }) order!: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Formulario DS-2019',
    description:
      'Título configurado para el programa y el país del participante. Reemplaza a `title` ' +
      'cuando está presente.',
  })
  programTitle!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'Debe presentar el formulario DS-2019 ante la embajada en Lima.',
    description:
      'Descripción configurada para el programa y el país del participante. Reemplaza a ' +
      '`instructions` cuando está presente.',
  })
  programDescription!: string | null;
}

export class UserDocumentSponsorInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

export class UserDocumentSponsorDto {
  @ApiProperty() id!: string;
  @ApiProperty() documentId!: string;
  @ApiProperty() sponsorId!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty({ example: 1 }) order!: number;
  @ApiProperty({ type: UserDocumentDocumentInfoDto }) document!: UserDocumentDocumentInfoDto;
  @ApiProperty({ type: UserDocumentSponsorInfoDto }) sponsor!: UserDocumentSponsorInfoDto;
}

export class UserDocumentEtiquetaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class UserDocumentHistoryCreatedByDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

export class UserDocumentObservationFileDto {
  @ApiProperty() id!: string;
  @ApiProperty() file!: string;
}

export class UserDocumentHistoryItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() userDocumentsId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) url!: string | null;
  @ApiPropertyOptional({ nullable: true }) observation!: string | null;
  @ApiProperty({ type: [UserDocumentEtiquetaDto] }) etiquetas!: UserDocumentEtiquetaDto[];
  @ApiProperty({ type: [UserDocumentObservationFileDto] }) files!: UserDocumentObservationFileDto[];
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiPropertyOptional({ type: UserDocumentHistoryCreatedByDto, nullable: true }) createdBy!: UserDocumentHistoryCreatedByDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class UserDocumentWithHistoryDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) documentSponsorId!: string | null;
  @ApiPropertyOptional({ nullable: true }) documentId!: string | null;
  @ApiProperty() userId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() statusDocument!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: UserDocumentSponsorDto, nullable: true })
  documentSponsor!: UserDocumentSponsorDto | null;
  @ApiPropertyOptional({ type: UserDocumentDocumentInfoDto, nullable: true })
  document!: UserDocumentDocumentInfoDto | null;
  @ApiProperty({ type: [UserDocumentHistoryItemDto] })
  history!: UserDocumentHistoryItemDto[];
}
