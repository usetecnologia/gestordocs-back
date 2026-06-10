import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'usuario@correo.com',
    description: 'Email o nombre de usuario',
  })
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ example: 'miContraseña123' })
  @IsString()
  @MinLength(6)
  password!: string;
}
