import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RelatedEntityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

export class TemporadaResponseDto {
  @ApiProperty({ example: 'uuid-de-la-temporada' }) id!: string;
  @ApiProperty({ example: 'uuid-del-programa' }) programId!: string;
  @ApiProperty({ example: 'Temporada 2026' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) createdAt!: Date;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) updatedAt!: Date;
  @ApiPropertyOptional({ type: RelatedEntityDto }) program?: RelatedEntityDto | null;
}
