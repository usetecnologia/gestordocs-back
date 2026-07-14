import { ApiProperty } from '@nestjs/swagger';

export class EmailActionResponseDto {
  @ApiProperty({ example: 'uuid-de-la-accion' }) id!: string;
  @ApiProperty({ example: 'Documento con estado observado' }) name!: string;
  @ApiProperty({ example: 'DOCUMENTO_OBSERVADO' }) code!: string;
}
