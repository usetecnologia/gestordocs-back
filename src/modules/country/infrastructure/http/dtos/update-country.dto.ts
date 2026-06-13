import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCountryDto {
  @ApiPropertyOptional({ example: 'EXT-001', description: 'ID externo del sistema de origen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idExterno?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

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

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
