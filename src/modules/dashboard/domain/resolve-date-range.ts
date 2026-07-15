import { DateRangePreset } from './date-range-preset.enum';

export interface ResolvedDateRange {
  from?: Date;
  to?: Date;
}

export function resolveDateRange(
  preset?: DateRangePreset,
  dateFrom?: string,
  dateTo?: string,
): ResolvedDateRange {
  if (preset === DateRangePreset.CUSTOM) {
    return {
      from: dateFrom ? new Date(dateFrom) : undefined,
      to: dateTo ? new Date(`${dateTo}T23:59:59.999`) : undefined,
    };
  }

  if (!preset) return {};

  const to = new Date();
  const from = new Date(to);
  if (preset === DateRangePreset.LAST_WEEK) from.setDate(from.getDate() - 7);
  if (preset === DateRangePreset.LAST_MONTH) from.setMonth(from.getMonth() - 1);
  if (preset === DateRangePreset.LAST_3_MONTHS) from.setMonth(from.getMonth() - 3);

  return { from, to };
}
