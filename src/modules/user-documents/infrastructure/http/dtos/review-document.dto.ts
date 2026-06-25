import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsString, IsUUID, MinLength } from 'class-validator';

export class AceptarDocumentDto {
  @ApiProperty({ example: 'uuid-del-user-document' })
  @IsUUID()
  userDocumentId!: string;
}

export class ObservarDocumentDto {
  @ApiProperty({ example: 'uuid-del-user-document' })
  @IsUUID()
  userDocumentId!: string;

  @ApiProperty({ example: 'El documento está incompleto, falta la firma.' })
  @IsString()
  @MinLength(1)
  observation!: string;

  @ApiProperty({
    type: String,
    example: '["uuid-etiqueta-1","uuid-etiqueta-2"]',
    description: 'JSON string con array de UUIDs de etiquetas',
  })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value ? [value] : []; }
    }
    return [];
  })
  @IsArray()
  @IsUUID('4', { each: true })
  etiquetaIds!: string[];
}
