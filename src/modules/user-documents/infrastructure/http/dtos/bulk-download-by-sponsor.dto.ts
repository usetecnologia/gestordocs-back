import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkDownloadBySponsorDto {
  @ApiProperty({
    type: [String],
    example: ['12345678', '87654321'],
    description: 'DNIs de los participantes a incluir en la descarga masiva (máx. 100).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  dnis!: string[];
}
