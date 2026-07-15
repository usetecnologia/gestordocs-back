import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { DateRangePreset } from '../../../domain/date-range-preset.enum';

export class DashboardFunnelQueryDto {
  @ApiPropertyOptional({ example: 'uuid-del-sponsor' })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-programa' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-pais' })
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({
    enum: DateRangePreset,
    example: DateRangePreset.LAST_MONTH,
    description:
      'Rango de fecha predefinido. Usa CUSTOM junto con dateFrom/dateTo para un rango personalizado. Si no se envía, no se filtra por fecha.',
  })
  @IsOptional()
  @IsEnum(DateRangePreset)
  range?: DateRangePreset;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Requerido cuando range = CUSTOM.' })
  @ValidateIf((o: DashboardFunnelQueryDto) => o.range === DateRangePreset.CUSTOM)
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Requerido cuando range = CUSTOM.' })
  @ValidateIf((o: DashboardFunnelQueryDto) => o.range === DateRangePreset.CUSTOM)
  @IsDateString()
  dateTo?: string;
}
