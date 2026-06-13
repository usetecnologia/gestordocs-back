import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOptionProgramDto {
  @ApiPropertyOptional({ example: 'EXT-001', description: 'ID externo del sistema de origen' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idExterno?: string;

  @ApiProperty({ example: 'Program Name' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'PN' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  shortName!: string;

  @ApiProperty({ example: 'pn_db' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  shortDatabase!: string;

  @ApiProperty({ example: 'uuid-del-pais' })
  @IsUUID()
  countryId!: string;

  @ApiProperty({ example: 'uuid-del-programa' })
  @IsUUID()
  programId!: string;

  @ApiProperty({ example: 'uuid-del-sponsor' })
  @IsUUID()
  sponsorId!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hideJobFair?: boolean;
}
