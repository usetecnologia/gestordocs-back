import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class IntranetLoginDto {
  @ApiProperty({ example: 'usuario@workuse.com', description: 'Email del usuario en la intranet' })
  @IsEmail()
  email!: string;
}
