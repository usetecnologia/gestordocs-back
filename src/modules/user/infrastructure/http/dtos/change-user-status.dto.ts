import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { UserStatus } from '../../../domain/user.enums';

export class ChangeUserStatusDto {
  @ApiProperty({ example: 'uuid-del-usuario' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: UserStatus, example: UserStatus.PENDIENTE_REVISAR })
  @IsEnum(UserStatus)
  currentStatus!: UserStatus;

  @ApiProperty({ enum: UserStatus, example: UserStatus.EN_REVISION })
  @IsEnum(UserStatus)
  newStatus!: UserStatus;
}
