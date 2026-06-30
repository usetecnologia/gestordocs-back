import { ApiProperty } from '@nestjs/swagger';

export class BulkLoadDataDto {
  @ApiProperty({ example: 'Tienes 4 errores' }) errors!: string;
  @ApiProperty({ example: 'Tienes 5 usuarios que ya existen' }) warning!: string;
  @ApiProperty({ example: 'Se crearon correctamente 10 usuarios' }) success!: string;
  @ApiProperty({ type: [String], example: ['12345678'] }) arrays_errors!: string[];
  @ApiProperty({ type: [String], example: ['87654321'] }) arrays_warning!: string[];
  @ApiProperty({ type: [String], example: ['11111111'] }) arrays_success!: string[];
}

export class BulkLoadResponseDto {
  @ApiProperty({ example: 'Datos cargados' }) message!: string;
  @ApiProperty({ type: BulkLoadDataDto }) data!: BulkLoadDataDto;
}
