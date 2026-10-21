import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userDocumentId!: string;
  @ApiProperty({ enum: ['APROBADO', 'OBSERVADO', 'REVISION_MANUAL', 'ERROR'] })
  decision!: 'APROBADO' | 'OBSERVADO' | 'REVISION_MANUAL' | 'ERROR';
  @ApiProperty({ description: 'Motivos de la decisión, para el revisor.' }) motivo!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Texto de la observación, si la IA observó.' })
  observacion!: string | null;
  @ApiProperty() createdAt!: Date;
}
