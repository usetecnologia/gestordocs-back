import { ApiProperty } from '@nestjs/swagger';

export class BulkInfoParticipantsResponseDto {
  @ApiProperty({
    example:
      'Sincronización de participantes iniciada en segundo plano. El resultado se notificará por correo al finalizar.',
  })
  message!: string;
}
