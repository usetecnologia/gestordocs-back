import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ example: ['uuid-etiqueta-1', 'uuid-etiqueta-2'], type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  etiquetaIds!: string[];
}
