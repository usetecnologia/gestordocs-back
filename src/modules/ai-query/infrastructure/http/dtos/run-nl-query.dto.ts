import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RunNlQueryDto {
  @ApiProperty({
    example: 'Muéstrame los 5 últimos usuarios registrados',
    description:
      'Pregunta en lenguaje natural. Se traduce a una consulta SELECT de solo lectura.',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3, { message: 'La consulta es demasiado corta.' })
  @MaxLength(500, {
    message: 'La consulta no puede superar los 500 caracteres.',
  })
  question!: string;
}
