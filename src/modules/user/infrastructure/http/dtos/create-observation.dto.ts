import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ type: [String], example: ['uuid-etiqueta-1', 'uuid-etiqueta-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  etiquetaIds?: string[];
}
