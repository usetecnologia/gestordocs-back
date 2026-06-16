import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateEtiquetaDto {
  @ApiProperty({ example: 'Urgente' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}
