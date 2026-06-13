import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateOptionProgramDto {
  @ApiPropertyOptional({ example: 'EXT-001', description: 'ID externo del sistema de origen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idExterno?: string;

  @ApiPropertyOptional({ example: 'Program Name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'PN' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  shortName?: string;

  @ApiPropertyOptional({ example: 'pn_db' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  shortDatabase?: string;

  @ApiPropertyOptional({ example: 'uuid-del-pais' })
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-programa' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-sponsor' })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  status?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hideJobFair?: boolean;
}
