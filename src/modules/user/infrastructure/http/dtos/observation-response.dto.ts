import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ObservationEtiquetaDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class ObservationCreatedByDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

class ObservationFileDto {
  @ApiProperty() id!: string;
  @ApiProperty() file!: string;
}

export class ObservationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() observation!: string;
  @ApiProperty() status!: boolean;
  @ApiPropertyOptional({ nullable: true }) endDate!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiPropertyOptional({ type: ObservationCreatedByDto, nullable: true }) createdBy!: ObservationCreatedByDto | null;
  @ApiProperty({ type: [ObservationEtiquetaDto] }) etiquetas!: ObservationEtiquetaDto[];
  @ApiProperty({ type: [ObservationFileDto] }) files!: ObservationFileDto[];
}
