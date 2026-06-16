import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UserRefDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() username!: string | null;
  @ApiPropertyOptional() email!: string | null;
}

export class EtiquetaResponseDto {
  @ApiProperty({ example: 'uuid-de-la-etiqueta' }) id!: string;
  @ApiProperty({ example: 'Urgente' }) name!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) createdById!:
    | string
    | null;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) updatedById!:
    | string
    | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: UserRefDto }) createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto }) updatedBy!: UserRefDto | null;
}
