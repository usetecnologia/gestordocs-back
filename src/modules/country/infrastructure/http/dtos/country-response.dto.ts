import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CountryResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'US' }) code!: string;
  @ApiProperty({ example: 'United States' }) name!: string;
  @ApiPropertyOptional({ example: 'USD' }) currency!: string | null;
  @ApiPropertyOptional({ example: '+1' }) countryCode!: string | null;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
