import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateDocumentOrderDto {
  @ApiPropertyOptional({ example: 1, description: 'Orden de presentación del documento. Enviar null para quitar el orden.', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number | null;
}
