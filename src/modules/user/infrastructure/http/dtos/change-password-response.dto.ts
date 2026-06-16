import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordResponseDto {
  @ApiProperty({ example: 'Contraseña actualizada correctamente.' })
  message!: string;
}
