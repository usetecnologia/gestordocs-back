import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UploadAvatarDto {
  @ApiProperty({ example: 'uuid-del-usuario' })
  @IsUUID()
  userId!: string;
}
