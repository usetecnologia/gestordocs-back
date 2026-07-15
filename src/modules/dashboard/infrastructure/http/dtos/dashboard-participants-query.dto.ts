import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { UserStatus } from '@modules/user/domain/user.enums';
import { DashboardFunnelQueryDto } from './dashboard-funnel-query.dto';

export class DashboardParticipantsQueryDto extends DashboardFunnelQueryDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.EN_REVISION, description: 'Estado del funnel seleccionado.' })
  @IsEnum(UserStatus)
  status!: UserStatus;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
