import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class FindActiveTemporadasQueryDto {
  @ApiProperty({
    example: 'uuid-programa-1,uuid-programa-2',
    description: 'IDs de programas separados por coma (uno o más).',
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  programIds!: string[];
}
