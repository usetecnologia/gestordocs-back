import { ApiProperty } from '@nestjs/swagger';

export class TerminarRevisionMasivoErrorItemDto {
  @ApiProperty({ example: 'uuid-del-participante' }) participantId!: string;
  @ApiProperty({ example: 'Participante no encontrado.' }) message!: string;
}

export class TerminarRevisionMasivoResponseDto {
  @ApiProperty({ example: 'Revisión masiva finalizada.' }) message!: string;
  @ApiProperty({ example: 2112 }) total!: number;
  @ApiProperty({ example: 2110 }) processed!: number;
  @ApiProperty({ type: [TerminarRevisionMasivoErrorItemDto] }) errors!: TerminarRevisionMasivoErrorItemDto[];
}
