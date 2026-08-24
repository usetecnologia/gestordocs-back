import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class FinalizarProcesoDto {
  @ApiProperty({
    type: [String],
    example: ['12345678', '87654321'],
    description: 'DNIs de los participantes cuyo proceso abierto se va a finalizar',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dnis!: string[];
}

export class ContinuarProcesoDto {
  @ApiProperty({
    example: '12345678',
    description: 'DNI del participante cuyo último proceso finalizado se va a reabrir',
  })
  @IsString()
  dni!: string;
}
