import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'US' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code!: string;

  @ApiProperty({ example: 'United States' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  currency?: string;

  @ApiPropertyOptional({ example: '+1' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  countryCode?: string;
}
