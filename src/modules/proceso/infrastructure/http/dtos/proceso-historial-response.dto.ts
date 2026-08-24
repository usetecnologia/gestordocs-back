import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcesoHistorialItemDto {
  @ApiProperty({ example: 'uuid-del-proceso' }) id!: string;
  @ApiProperty({ example: 'FINALIZADO', enum: ['EN_PROCESO', 'FINALIZADO'] }) estado!: string;
  @ApiProperty({ example: 'APROBADO_SPONSOR' }) statusDocumental!: string;
  @ApiProperty({ example: '2026-01-15T00:00:00.000Z' }) fechaIngreso!: Date;

  @ApiPropertyOptional({ example: '2026-08-24T15:00:00.000Z', nullable: true })
  finalizadoAt!: Date | null;

  @ApiPropertyOptional({ example: 'Ana Ramírez', nullable: true, description: 'Quién lo finalizó' })
  finalizadoPor!: string | null;

  @ApiPropertyOptional({ example: 'Work and Travel USA', nullable: true }) programa!: string | null;
  @ApiPropertyOptional({ example: 'CON', nullable: true }) opcion!: string | null;
  @ApiPropertyOptional({ example: 'Perú', nullable: true }) pais!: string | null;
  @ApiPropertyOptional({ example: 'CIEE', nullable: true }) sponsor!: string | null;
  @ApiPropertyOptional({ example: '2026 - 2027', nullable: true }) temporada!: string | null;

  @ApiProperty({ example: 9, description: 'Documentos vigentes del ciclo' })
  documentos!: number;

  @ApiProperty({ example: 6, description: 'De esos, cuántos tienen avance real (no PENDIENTE)' })
  documentosConAvance!: number;

  @ApiProperty({ example: true, description: 'Si es el ciclo que el participante ve hoy' })
  esVisible!: boolean;
}
