import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InfoParticipantDto {
  @ApiProperty({ example: '73765938' })
  @IsString()
  @IsNotEmpty()
  dni!: string;
}
