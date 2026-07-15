import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '@modules/user/domain/user.enums';
import { DashboardFunnelQueryDto } from './dashboard-funnel-query.dto';

export class DashboardFunnelExportQueryDto extends DashboardFunnelQueryDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.EN_REVISION, description: 'Estado del funnel a exportar.' })
  @IsEnum(UserStatus)
  status!: UserStatus;
}
