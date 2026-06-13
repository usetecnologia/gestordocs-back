import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SponsorResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiPropertyOptional({ example: 'EXT-001' }) idExterno!: string | null;
  @ApiProperty({ example: 'SP01' }) code!: string;
  @ApiProperty({ example: 'CIEE' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
