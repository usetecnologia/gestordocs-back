import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEmail, IsString } from 'class-validator';

export class SendTestMailDto {
  @ApiProperty({ example: 'jose.cerna.inc@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: ['DNI - Frontal', 'Recibo de servicios', 'Constancia de estudios'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  documents!: string[];
}
