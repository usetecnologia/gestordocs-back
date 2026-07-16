import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { EmailTemplateType } from '../../../domain/email-template.enums';
import { EmailTemplateScheduleDto } from './email-template-schedule.dto';

export class CreateEmailTemplateDto {
  @ApiProperty({ example: 'Documento observado' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'DOCUMENTO_OBSERVADO' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'code solo puede contener mayúsculas, números y guion bajo.' })
  code!: string;

  @ApiProperty({ example: 'Bienvenido a {{nombrePrograma}}' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  subject!: string;

  @ApiProperty({ example: '<p>Hola {{nombreParticipante}}...</p>' })
  @IsString()
  @IsNotEmpty({ message: 'htmlContent no puede estar vacío.' })
  htmlContent!: string;

  @ApiProperty({ example: 'uuid-de-la-accion' })
  @IsUUID()
  actionId!: string;

  @ApiProperty({ enum: EmailTemplateType })
  @IsEnum(EmailTemplateType)
  type!: EmailTemplateType;

  @ApiPropertyOptional({
    type: EmailTemplateScheduleDto,
    description: 'Obligatorio cuando type es PROGRAMADA. Omitir (o null) cuando type es NORMAL.',
  })
  @ValidateIf((o: CreateEmailTemplateDto) => o.type === EmailTemplateType.PROGRAMADA)
  @IsDefined({ message: 'schedule es obligatorio cuando type es PROGRAMADA.' })
  @ValidateNested()
  @Type(() => EmailTemplateScheduleDto)
  schedule?: EmailTemplateScheduleDto | null;
}
