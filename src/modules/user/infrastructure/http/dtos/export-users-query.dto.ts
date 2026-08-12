import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { UserStatus } from '../../../domain/user.enums';

export class ExportUsersQueryDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    example: 'uuid-del-rol',
    description: 'Si no se envía, se exportan por defecto los usuarios con rol Participante.',
  })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-pais' })
  @IsOptional()
  @IsUUID()
  countryId?: string;

  @ApiPropertyOptional({ example: 'uuid-del-sponsor' })
  @IsOptional()
  @IsUUID()
  sponsorId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true = solo participantes con sponsor asociado. false = solo participantes sin sponsor.',
  })
  @IsOptional()
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key as string];
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  hasSponsor?: boolean;

  @ApiPropertyOptional({ example: 'uuid-del-programa' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ example: 'uuid-de-la-opcion' })
  @IsOptional()
  @IsUUID()
  optionProgramId?: string;

  @ApiPropertyOptional({ enum: ['ACCEPTED', 'INPROCESS'], example: 'ACCEPTED' })
  @IsOptional()
  @IsIn(['ACCEPTED', 'INPROCESS'])
  statusSolRetiro?: 'ACCEPTED' | 'INPROCESS';

  @ApiPropertyOptional({
    enum: ['ACTIVO', 'INACTIVO'],
    example: 'ACTIVO',
    description:
      'Si no se envía, muestra todos. ACTIVO = todos los participantes en cualquier estado excepto INACTIVO. INACTIVO = solo los participantes en estado INACTIVO.',
  })
  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  generalStatus?: 'ACTIVO' | 'INACTIVO';

  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ['firstname', 'lastfathername'],
    example: 'lastfathername',
    description: 'Si no se envía, se mantiene el orden por defecto (createdAt desc).',
  })
  @IsOptional()
  @IsIn(['firstname', 'lastfathername'])
  sortBy?: 'firstname' | 'lastfathername';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'asc', description: 'Solo aplica junto con sortBy.' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
