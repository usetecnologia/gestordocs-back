import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSponsorDto {
  @ApiPropertyOptional({ example: 'EXT-001', description: 'ID externo del sistema de origen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idExterno?: string;

  @ApiProperty({ example: 'SP01' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code!: string;

  @ApiProperty({ example: 'CIEE' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;
}
