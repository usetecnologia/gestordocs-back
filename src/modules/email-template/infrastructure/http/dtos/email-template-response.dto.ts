import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailTemplateType, WeekDay } from '../../../domain/email-template.enums';

class EmailActionRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class UserRefDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional() username!: string | null;
  @ApiPropertyOptional() email!: string | null;
}

class EmailTemplateScheduleResponseDto {
  @ApiProperty({ enum: WeekDay, isArray: true }) days!: WeekDay[];
  @ApiProperty({ example: '08:00' }) time!: string;
  @ApiProperty({ example: 'America/Lima' }) timezone!: string;
}

export class EmailTemplateResponseDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Bienvenida al participante' }) name!: string;
  @ApiProperty({ example: 'BIENVENIDA_PARTICIPANTE' }) code!: string;
  @ApiProperty({ example: 'Bienvenido a {{nombrePrograma}}' }) subject!: string;
  @ApiProperty({ example: '<p>Hola {{nombreParticipante}}...</p>' }) htmlContent!: string;
  @ApiProperty({ example: true }) status!: boolean;
  @ApiProperty({ enum: EmailTemplateType }) type!: EmailTemplateType;
  @ApiProperty({ example: 'uuid-de-la-accion' }) actionId!: string;
  @ApiProperty({ type: EmailActionRefDto }) action!: EmailActionRefDto;
  @ApiPropertyOptional({ type: EmailTemplateScheduleResponseDto, nullable: true })
  schedule!: EmailTemplateScheduleResponseDto | null;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) createdById!: string | null;
  @ApiPropertyOptional({ example: 'uuid-del-usuario' }) updatedById!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ type: UserRefDto }) createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: UserRefDto }) updatedBy!: UserRefDto | null;
}
