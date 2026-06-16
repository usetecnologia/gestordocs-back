import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'uuid-del-usuario' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'CurrentP@ssw0rd' })
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ example: 'NewP@ssw0rd', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
