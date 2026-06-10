import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Administrador' }) name!: string;
  @ApiPropertyOptional({ example: 'ADMIN' }) code!: string | null;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty({ example: false }) isSystem!: boolean;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
