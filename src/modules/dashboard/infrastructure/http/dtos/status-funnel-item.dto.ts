import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@modules/user/domain/user.enums';

export class StatusFunnelItemDto {
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ example: 42 }) count!: number;
}
