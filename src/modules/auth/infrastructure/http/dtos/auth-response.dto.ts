import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoleSnapshotDto {
  @ApiProperty({ example: 'uuid-del-rol' }) id!: string;
  @ApiProperty({ example: 'Administrador' }) name!: string;
  @ApiProperty({ example: 'ADMIN', nullable: true }) code!: string | null;
}

export class PersonSnapshotDto {
  @ApiProperty({ example: 'Juan' }) firstname!: string;
  @ApiProperty({ example: 'Carlos', nullable: true }) middlename!: string | null;
  @ApiProperty({ example: 'Pérez' }) lastfathername!: string;
  @ApiProperty({ example: 'García', nullable: true }) lastmothername!: string | null;
  @ApiProperty({ example: '+51999999999', nullable: true }) phone!: string | null;
  @ApiProperty({ example: 'https://res.cloudinary.com/...', nullable: true }) avatar!: string | null;
  @ApiProperty({ example: '12345678', nullable: true }) dni!: string | null;
}

export class EntitySnapshotDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Nombre' }) name!: string;
  @ApiProperty({ example: 'CODE' }) code!: string;
}

export class OptionProgramSnapshotDto {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CON' }) shortDatabase!: string;
}

export class AuthUserSnapshotDto {
  @ApiProperty({ example: 'uuid-del-usuario' }) id!: string;
  @ApiProperty({ example: 'jdoe', nullable: true }) username!: string | null;
  @ApiProperty({ example: 'jdoe@correo.com', nullable: true }) email!: string | null;
  @ApiProperty({ type: RoleSnapshotDto }) role!: RoleSnapshotDto;
  @ApiProperty({ example: 'ACTIVO' }) status!: string;
  @ApiProperty({ type: PersonSnapshotDto, nullable: true }) person!: PersonSnapshotDto | null;
  @ApiPropertyOptional({ type: EntitySnapshotDto, nullable: true }) country?: EntitySnapshotDto | null;
  @ApiPropertyOptional({ type: EntitySnapshotDto, nullable: true }) program?: EntitySnapshotDto | null;
  @ApiPropertyOptional({ type: EntitySnapshotDto, nullable: true }) sponsor?: EntitySnapshotDto | null;
  @ApiPropertyOptional({ type: OptionProgramSnapshotDto, nullable: true }) optionProgram?: OptionProgramSnapshotDto | null;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;

  @ApiProperty({ type: AuthUserSnapshotDto })
  user!: AuthUserSnapshotDto;
}

export class TokensResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string;
}
