import { ApiProperty } from '@nestjs/swagger';

export class FinalizarProcesoErrorItemDto {
  @ApiProperty({ example: '12345678' })
  dni!: string;

  @ApiProperty({ example: 'El participante no tiene un proceso abierto.' })
  reason!: string;
}

export class FinalizarProcesoResponseDto {
  @ApiProperty({ example: 3 })
  totalSuccess!: number;

  @ApiProperty({ example: 1 })
  totalErrors!: number;

  @ApiProperty({ type: [String], example: ['12345678', '87654321'] })
  successes!: string[];

  @ApiProperty({ type: [FinalizarProcesoErrorItemDto] })
  errors!: FinalizarProcesoErrorItemDto[];
}
