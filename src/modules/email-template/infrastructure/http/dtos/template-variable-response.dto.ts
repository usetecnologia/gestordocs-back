import { ApiProperty } from '@nestjs/swagger';

export class TemplateVariableResponseDto {
  @ApiProperty({ example: 'nombreParticipante' }) key!: string;
  @ApiProperty({ example: '{{nombreParticipante}}', description: 'Token exacto a insertar en subject/htmlContent' })
  token!: string;
  @ApiProperty({ example: 'Nombre del participante' }) label!: string;
  @ApiProperty({ example: 'Nombre completo del participante que recibe el correo.' }) description!: string;
}
