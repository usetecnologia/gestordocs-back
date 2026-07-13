import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class BulkAceptarDocumentDto {
  @ApiProperty({
    type: [String],
    example: ['12345678', '87654321'],
    description: 'DNIs de los participantes',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dnis!: string[];

  @ApiProperty({ example: 'uuid-del-documento' })
  @IsUUID()
  documentId!: string;

  @ApiPropertyOptional({
    example: 'uuid-del-sponsor',
    description: 'Requerido solo si el documento está asociado a un sponsor',
  })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;
}
