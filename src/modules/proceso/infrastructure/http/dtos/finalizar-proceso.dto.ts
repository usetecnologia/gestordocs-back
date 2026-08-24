import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class FinalizarProcesoDto {
  @ApiProperty({
    type: [String],
    example: ['uuid-del-proceso-1', 'uuid-del-proceso-2'],
    description:
      'Ids de los ciclos a finalizar. Se identifican por proceso y no por participante: el listado ' +
      'muestra una fila por ciclo, y se cierra exactamente el que se está viendo.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  procesoIds!: string[];
}

export class ContinuarProcesoDto {
  @ApiProperty({
    example: 'uuid-del-proceso',
    description: 'Id del ciclo finalizado que se va a reabrir',
  })
  @IsUUID()
  procesoId!: string;
}
