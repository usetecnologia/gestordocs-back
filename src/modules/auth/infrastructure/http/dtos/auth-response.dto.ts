import { ApiProperty } from '@nestjs/swagger';

export class RoleSnapshotDto {
  @ApiProperty({ example: 'uuid-del-rol' }) id!: string;
  @ApiProperty({ example: 'Administrador' }) name!: string;
  @ApiProperty({ example: 'ADMIN', nullable: true }) code!: string | null;
}

export class AuthUserSnapshotDto {
  @ApiProperty({ example: 'uuid-del-usuario' }) id!: string;
  @ApiProperty({ example: 'jdoe', nullable: true }) username!: string | null;
  @ApiProperty({ example: 'jdoe@correo.com', nullable: true }) email!: string | null;
  @ApiProperty({ type: RoleSnapshotDto }) role!: RoleSnapshotDto;
  @ApiProperty({ example: 'ACTIVO' }) status!: string;
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
