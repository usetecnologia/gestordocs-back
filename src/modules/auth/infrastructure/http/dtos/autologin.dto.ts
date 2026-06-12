import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AutoLoginDto {
  @ApiProperty({ example: '12345678', description: 'DNI del usuario' })
  @IsString()
  @MinLength(1)
  dni!: string;
}
