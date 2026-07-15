import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { NO_SPONSOR_FILTER_VALUE, WITH_SPONSOR_FILTER_VALUE } from '@modules/user/domain/user.repository';
import { DateRangePreset } from '../../../domain/date-range-preset.enum';

const SPONSOR_SENTINEL_VALUES: string[] = [NO_SPONSOR_FILTER_VALUE, WITH_SPONSOR_FILTER_VALUE];

export class DashboardFunnelQueryDto {
  @ApiPropertyOptional({
    example: 'uuid-del-sponsor',
    description:
      `UUID del sponsor. Usa "${NO_SPONSOR_FILTER_VALUE}" para filtrar participantes sin sponsor asociado, ` +
      `o "${WITH_SPONSOR_FILTER_VALUE}" para filtrar participantes con al menos un sponsor asociado.`,
  })
  @IsOptional()
  @ValidateIf((o: DashboardFunnelQueryDto) => !SPONSOR_SENTINEL_VALUES.includes(o.sponsorId ?? ''))
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

  @ApiPropertyOptional({
    enum: ['ACTIVO', 'INACTIVO'],
    example: 'ACTIVO',
    description:
      'Si no se envía, no filtra por esto. ACTIVO = cualquier estado excepto INACTIVO. INACTIVO = solo participantes en estado INACTIVO. Si se envía junto con un status específico, generalStatus prevalece.',
  })
  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  generalStatus?: 'ACTIVO' | 'INACTIVO';
}
