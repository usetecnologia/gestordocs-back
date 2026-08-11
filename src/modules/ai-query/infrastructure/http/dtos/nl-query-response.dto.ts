import { ApiProperty } from '@nestjs/swagger';
import type { QueryRow } from '../../../domain/nl-query-result';

export class NlQueryResponseDto {
  @ApiProperty({ example: 'Muéstrame los 5 últimos usuarios registrados' })
  question!: string;

  @ApiProperty({
    example:
      'SELECT u.email AS correo, u.created_at AS registrado FROM `User` u ORDER BY u.created_at DESC LIMIT 5',
    description:
      'SQL de solo lectura realmente ejecutado, ya validado y con LIMIT garantizado.',
  })
  sql!: string;

  @ApiProperty({
    example: 'Los 5 usuarios más recientes con su correo y fecha de registro.',
  })
  explanation!: string;

  @ApiProperty({ example: ['correo', 'registrado'], type: [String] })
  columns!: string[];

  @ApiProperty({
    description: 'Filas del resultado. Cada fila es un objeto columna → valor.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    example: [
      { correo: 'ana@correo.com', registrado: '2026-08-01T10:15:00.000Z' },
    ],
  })
  rows!: QueryRow[];

  @ApiProperty({ example: 5 })
  rowCount!: number;

  @ApiProperty({
    example: false,
    description:
      'true cuando se alcanzó el máximo de filas y puede haber más resultados.',
  })
  truncated!: boolean;

  @ApiProperty({
    example: 43,
    description: 'Tiempo de ejecución de la consulta en milisegundos.',
  })
  executionMs!: number;
}
