import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class BulkObservarDocumentDto {
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

  @ApiProperty({ example: 'El documento está incompleto, falta la firma.' })
  @IsString()
  @MinLength(1)
  observation!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['uuid-etiqueta-1', 'uuid-etiqueta-2'],
    description: 'IDs de etiquetas (opcional)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  etiquetaIds?: string[];
}
