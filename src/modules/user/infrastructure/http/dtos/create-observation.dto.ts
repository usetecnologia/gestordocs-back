import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateObservationDto {
  @ApiProperty({ example: 'uuid-del-participante', description: 'UUID del participante a observar' })
  @IsUUID()
  participantId!: string;

  @ApiProperty({ example: 'uuid-del-usuario-que-observa', description: 'UUID del usuario que registra la observación' })
  @IsUUID()
  createdById!: string;

  @ApiProperty({ example: 'El participante no ha completado los documentos requeridos.' })
  @IsString()
  @MinLength(1)
  observation!: string;

  @ApiPropertyOptional({
    type: String,
    example: '["uuid-etiqueta-1","uuid-etiqueta-2"]',
    description: 'JSON string con array de UUIDs de etiquetas',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value ? [value] : []; }
    }
    return [];
  })
  @IsArray()
  @IsUUID('4', { each: true })
  etiquetaIds?: string[];
}
