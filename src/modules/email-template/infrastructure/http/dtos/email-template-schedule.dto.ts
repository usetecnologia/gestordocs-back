import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsEnum, IsIn, Matches } from 'class-validator';
import { PERU_TIMEZONE, WeekDay } from '../../../domain/email-template.enums';

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EmailTemplateScheduleDto {
  @ApiProperty({ enum: WeekDay, isArray: true, example: ['MONDAY', 'WEDNESDAY', 'SUNDAY'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(WeekDay, { each: true })
  days!: WeekDay[];

  @ApiProperty({ example: '08:00', description: 'Hora en formato 24h HH:mm' })
  @Matches(TIME_24H_PATTERN, { message: 'time debe tener el formato HH:mm (24h).' })
  time!: string;

  @ApiProperty({ example: 'America/Lima' })
  @IsIn([PERU_TIMEZONE], { message: `timezone debe ser "${PERU_TIMEZONE}".` })
  timezone!: string;
}
