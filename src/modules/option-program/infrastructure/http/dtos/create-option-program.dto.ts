import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateOptionProgramDto {
  @ApiProperty({ example: 'CON' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  shortDatabase!: string;

  @ApiProperty({ example: 'uuid-del-programa' })
  @IsUUID()
  programId!: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  status?: boolean;
}
