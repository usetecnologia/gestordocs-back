import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RelatedEntityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

export class OptionProgramResponseDto {
  @ApiProperty({ example: 'uuid-de-la-opcion' }) id!: string;
  @ApiPropertyOptional({ example: 'EXT-001' }) idExterno!: string | null;
  @ApiProperty({ example: 'Program Name' }) name!: string;
  @ApiProperty({ example: 'PN' }) shortName!: string;
  @ApiProperty({ example: 'pn_db' }) shortDatabase!: string;
  @ApiProperty({ example: 'uuid-del-pais' }) countryId!: string;
  @ApiProperty({ example: 'uuid-del-programa' }) programId!: string;
  @ApiProperty({ example: 'uuid-del-sponsor' }) sponsorId!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty({ example: false }) hideJobFair!: boolean;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) createdAt!: Date;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) updatedAt!: Date;
  @ApiPropertyOptional({ type: RelatedEntityDto }) country?: RelatedEntityDto | null;
  @ApiPropertyOptional({ type: RelatedEntityDto }) program?: RelatedEntityDto | null;
  @ApiPropertyOptional({ type: RelatedEntityDto }) sponsor?: RelatedEntityDto | null;
}
