import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { UserStatus } from '../../../domain/user.enums';
import { toIdList } from '@common/utils/query-list.util';

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

  @ApiPropertyOptional({
    type: [String],
    example: 'uuid-del-programa-1,uuid-del-programa-2',
    description:
      'Uno o varios programas, separados por coma. Si se envía, tiene prioridad sobre `programId`.',
  })
  @IsOptional()
  @Transform(({ value }) => toIdList(value))
  @IsArray()
  @IsUUID('all', { each: true })
  programIds?: string[];

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

  @ApiPropertyOptional({
    enum: ['EN_PROCESO', 'FINALIZADO'],
    example: 'EN_PROCESO',
    description:
      'Estado del ciclo. El listado devuelve una fila por proceso, así que esto filtra las filas: ' +
      'EN_PROCESO = solo los ciclos abiertos, FINALIZADO = solo los cerrados. Sin enviarlo, ambos.',
  })
  @IsOptional()
  @IsIn(['EN_PROCESO', 'FINALIZADO'])
  procesoEstado?: 'EN_PROCESO' | 'FINALIZADO';

  @ApiPropertyOptional({
    enum: ['SI', 'NO'],
    example: 'SI',
    description:
      'Filtra por si el participante tiene fecha de envío al sponsor. SI = tiene un valor en fechadeenvioalsponsor. ' +
      'NO = el campo está vacío/nulo.',
  })
  @IsOptional()
  @IsIn(['SI', 'NO'])
  fechaEnvioSponsor?: 'SI' | 'NO';

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
