import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class FindTemporadasQueryDto {
  @ApiProperty({ example: 'uuid-del-programa', description: 'Programa cuyas temporadas se listan' })
  @IsUUID()
  programId!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ example: true, description: 'Filtra por estado (activo/inactivo)' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key as string];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  })
  status?: boolean;

  @ApiPropertyOptional({ example: 'verano' })
  @IsOptional()
  @IsString()
  search?: string;
}
