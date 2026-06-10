import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '../../../domain/user.enums';

export class CreateUserDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstname!: string;

  @ApiPropertyOptional({ example: 'Michael' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middlename?: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastfathername!: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastmothername?: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsString()
  birthdate?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'johndoe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ example: 'P@ssw0rd123', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ example: 'uuid-del-rol' })
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional({ example: 'uuid-del-pais' })
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-sponsor' })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-programa' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-opcion' })
  @IsOptional()
  @IsUUID()
  optionProgramId?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVO })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
