import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../../domain/user.enums';

class RoleRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() code!: string | null;
}

class SimpleRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
}

class OptionProgramRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() shortName!: string;
}

class EtiquetaRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class ObservationCreatedByDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

class UserObservationDto {
  @ApiProperty() id!: string;
  @ApiProperty() observation!: string;
  @ApiProperty() status!: boolean;
  @ApiPropertyOptional({ nullable: true }) endDate!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiPropertyOptional({ type: ObservationCreatedByDto, nullable: true }) createdBy!: ObservationCreatedByDto | null;
  @ApiProperty({ type: [EtiquetaRefDto] }) etiquetas!: EtiquetaRefDto[];
}

class HistoryCreatedByDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
}

class UserHistoryStatusItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: UserStatus }) status!: string;
  @ApiPropertyOptional({ nullable: true }) createdById!: string | null;
  @ApiPropertyOptional({ type: HistoryCreatedByDto, nullable: true }) createdBy!: HistoryCreatedByDto | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-del-usuario' }) id!: string;
  @ApiProperty({ example: 'John' }) firstname!: string;
  @ApiPropertyOptional({ example: 'Michael' }) middlename!: string | null;
  @ApiProperty({ example: 'Doe' }) lastfathername!: string;
  @ApiPropertyOptional({ example: 'Smith' }) lastmothername!: string | null;
  @ApiPropertyOptional({ example: '1990-01-15' }) birthdate!: string | null;
  @ApiPropertyOptional({ example: '+1234567890' }) phone!: string | null;
  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/...' }) avatar!: string | null;
  @ApiPropertyOptional({ example: 'johndoe' }) username!: string | null;
  @ApiPropertyOptional({ example: 'john@example.com' }) email!: string | null;
  @ApiProperty({ example: 'uuid-del-rol' }) roleId!: string;
  @ApiPropertyOptional({ example: 'uuid-del-pais' }) countryId!: string | null;
  @ApiPropertyOptional({ example: 'uuid-del-sponsor' }) sponsorId!: string | null;
  @ApiPropertyOptional({ example: 'uuid-del-programa' }) programId!: string | null;
  @ApiPropertyOptional({ example: 'uuid-de-la-opcion' }) optionProgramId!: string | null;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) createdAt!: Date;
  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' }) updatedAt!: Date;
  @ApiPropertyOptional({ type: RoleRefDto }) role?: RoleRefDto | null;
  @ApiPropertyOptional({ type: SimpleRefDto }) country?: SimpleRefDto | null;
  @ApiPropertyOptional({ type: SimpleRefDto }) sponsor?: SimpleRefDto | null;
  @ApiPropertyOptional({ type: SimpleRefDto }) program?: SimpleRefDto | null;
  @ApiPropertyOptional({ type: OptionProgramRefDto }) optionProgram?: OptionProgramRefDto | null;
  @ApiPropertyOptional({ type: [UserObservationDto] }) observations?: UserObservationDto[] | null;
  @ApiPropertyOptional({ type: [UserHistoryStatusItemDto] }) historyStatus?: UserHistoryStatusItemDto[] | null;
}
