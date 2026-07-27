import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramTemporadaDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Temporada Verano 2026' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
}

export class ProgramResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiPropertyOptional({ example: 'EXT-001' }) idExterno!: string | null;
  @ApiProperty({ example: 'WK' }) code!: string;
  @ApiProperty({ example: 'Work & Travel' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: [ProgramTemporadaDto] }) temporadas!: ProgramTemporadaDto[];
}
