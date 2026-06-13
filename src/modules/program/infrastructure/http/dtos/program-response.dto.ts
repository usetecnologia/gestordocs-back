import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiPropertyOptional({ example: 'EXT-001' }) idExterno!: string | null;
  @ApiProperty({ example: 'WK' }) code!: string;
  @ApiProperty({ example: 'Work & Travel' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
