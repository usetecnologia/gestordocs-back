import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FinalizarProcesoErrorItemDto {
  @ApiProperty({ example: 'uuid-del-proceso' })
  procesoId!: string;

  @ApiPropertyOptional({
    example: '12345678',
    nullable: true,
    description: 'DNI del participante, para que el reporte se entienda',
  })
  dni!: string | null;

  @ApiProperty({ example: 'Ese ciclo ya está finalizado.' })
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
