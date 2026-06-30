import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkUploadSuccessItemDto {
  @ApiProperty({ example: '12345678_DS2019.pdf' }) filename!: string;
  @ApiProperty({ example: '12345678' }) dni!: string;
  @ApiProperty({ example: 'DS2019' }) siglasCode!: string;
  @ApiProperty({ example: 'uuid-del-usuario' }) userId!: string;
  @ApiProperty({ example: 'uuid-del-documento' }) documentId!: string;
}

export class BulkUploadErrorItemDto {
  @ApiProperty({ example: '99999999_INVALID.pdf' }) filename!: string;
  @ApiProperty({ example: 'Usuario con DNI "99999999" no encontrado.' }) reason!: string;
  @ApiPropertyOptional({ example: '99999999' }) dni?: string;
  @ApiPropertyOptional({ example: 'INVALID' }) siglasCode?: string;
}

export class BulkUploadByFilenameResponseDto {
  @ApiProperty({ example: 3 }) totalSuccess!: number;
  @ApiProperty({ example: 2 }) totalErrors!: number;
  @ApiProperty({ type: [BulkUploadSuccessItemDto] }) successes!: BulkUploadSuccessItemDto[];
  @ApiProperty({ type: [BulkUploadErrorItemDto] }) errors!: BulkUploadErrorItemDto[];
}
