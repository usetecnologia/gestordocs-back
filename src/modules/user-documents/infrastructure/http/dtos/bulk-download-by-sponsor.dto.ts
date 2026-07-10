import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkDownloadBySponsorDto {
  @ApiProperty({
    type: String,
    example: '["12345678","87654321"]',
    description: 'JSON string con el array de DNIs de los participantes a incluir en la descarga masiva (máx. 100).',
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value ? [value] : []; }
    }
    return [];
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  dnis!: string[];
}
