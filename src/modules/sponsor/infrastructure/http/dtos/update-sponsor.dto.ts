import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSponsorDto {
  @ApiPropertyOptional({ example: 'SP01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code?: string;

  @ApiPropertyOptional({ example: 'CIEE' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
