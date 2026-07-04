import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TerminarRevisionDto {
  @ApiProperty({ example: 'uuid-del-participante' })
  @IsUUID()
  participantId!: string;

  @ApiProperty({ example: 'uuid-del-usuario-que-ejecuta' })
  @IsUUID()
  createdById!: string;
}
