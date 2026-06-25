import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Administrador' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'ADMIN' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ example: 'Acceso total al sistema' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Boolean, example: false, description: 'Indica si el rol es del sistema y no puede eliminarse' })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
