import { ApiProperty } from '@nestjs/swagger';

export class InfoParticipantResponseDto {
  @ApiProperty({ example: 'Participante actualizado correctamente.' })
  message!: string;
}
