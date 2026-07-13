import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class FindDocumentsBySponsorQueryDto {
  @ApiProperty({
    example: 'uuid-sponsor-1,uuid-sponsor-2',
    description: 'IDs de sponsors separados por coma',
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
    return value;
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  sponsorIds!: string[];
}
