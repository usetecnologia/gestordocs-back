import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { UserStatus } from '../../../domain/user.enums';

export class FindUsersQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'uuid-del-rol' })
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
