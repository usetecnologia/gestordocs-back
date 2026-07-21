import { ApiProperty } from '@nestjs/swagger';

export class RevisionMasivaPasaporteResponseDto {
  @ApiProperty({
    example:
      'Revisión masiva de pasaportes iniciada en segundo plano. El resultado (Excel) se enviará por correo al finalizar.',
  })
  message!: string;
}
