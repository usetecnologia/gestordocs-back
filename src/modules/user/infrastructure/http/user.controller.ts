import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Query,
  ParseUUIDPipe,
  Res,
  ConflictException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiProduces,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ParseImagePipe } from '@common/pipes/parse-image.pipe';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import {
  PaginationResultDto,
  toPaginationResult,
} from '@common/dtos/pagination-result.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { FindAllUserUseCase } from '../../application/use-cases/find-all-user.use-case';
import { FindAllStaffUseCase } from '../../application/use-cases/find-all-staff.use-case';
import { FindOneUserUseCase } from '../../application/use-cases/find-one-user.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { UpdateUserProfileUseCase } from '../../application/use-cases/update-user-profile.use-case';
import { UploadAvatarUseCase } from '../../application/use-cases/upload-avatar.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { AdminChangePasswordUseCase } from '../../application/use-cases/admin-change-password.use-case';
import { ChangeUserStatusUseCase } from '../../application/use-cases/change-user-status.use-case';
import { CreateObservationUseCase } from '../../application/use-cases/create-observation.use-case';
import { CloseObservationUseCase } from '../../application/use-cases/close-observation.use-case';
import { BulkLoadUsersUseCase } from '../../application/use-cases/bulk-load-users.use-case';
import { BulkInfoParticipantsUseCase } from '../../application/use-cases/bulk-info-participants.use-case';
import { InfoParticipantUseCase } from '../../application/use-cases/info-participant.use-case';
import { ExportParticipantsDocumentsUseCase } from '../../application/use-cases/export-participants-documents.use-case';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';
import { UploadAvatarDto } from './dtos/upload-avatar.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { ChangePasswordResponseDto } from './dtos/change-password-response.dto';
import { AdminChangePasswordDto } from './dtos/admin-change-password.dto';
import { ChangeUserStatusDto } from './dtos/change-user-status.dto';
import { CreateObservationDto } from './dtos/create-observation.dto';
import { ObservationResponseDto } from './dtos/observation-response.dto';
import { UserResponseDto } from './dtos/user-response.dto';
import { FindUsersQueryDto } from './dtos/find-users-query.dto';
import { ExportUsersQueryDto } from './dtos/export-users-query.dto';
import { BulkLoadResponseDto } from './dtos/bulk-load-response.dto';
import { BulkInfoParticipantsResponseDto } from './dtos/bulk-info-participants-response.dto';
import { InfoParticipantDto } from './dtos/info-participant.dto';
import { InfoParticipantResponseDto } from './dtos/info-participant-response.dto';
import type { MulterFile } from '../../domain/multer-file.interface';


@ApiTags('users')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UserController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly findAllUser: FindAllUserUseCase,
    private readonly findAllStaff: FindAllStaffUseCase,
    private readonly findOneUser: FindOneUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly updateUserProfile: UpdateUserProfileUseCase,
    private readonly uploadAvatar: UploadAvatarUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly adminChangePassword: AdminChangePasswordUseCase,
    private readonly changeUserStatus: ChangeUserStatusUseCase,
    private readonly createObservation: CreateObservationUseCase,
    private readonly closeObservation: CloseObservationUseCase,
    private readonly bulkLoadUsers: BulkLoadUsersUseCase,
    private readonly bulkInfoParticipants: BulkInfoParticipantsUseCase,
    private readonly infoParticipant: InfoParticipantUseCase,
    private readonly exportParticipantsDocuments: ExportParticipantsDocumentsUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear usuario' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiConflictResponse({ description: 'El nombre de usuario o el correo electrónico ya están en uso.' })
  create(@Body() dto: CreateUserDto) {
    return this.createUser.execute(dto);
  }

  @Post('bulk-load')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Carga masiva de usuarios desde Workuse — crea los que no existen, ignora los duplicados',
  })
  @ApiOkResponse({ type: BulkLoadResponseDto })
  async bulkLoad(): Promise<BulkLoadResponseDto> {
    const result = await this.bulkLoadUsers.execute();
    return {
      message: 'Datos cargados',
      data: {
        errors: `Tienes ${result.errors.length} errores`,
        warning: `Tienes ${result.existing.length} usuarios que ya existen`,
        success: `Se crearon correctamente ${result.created.length} usuarios`,
        arrays_errors: result.errors,
        arrays_warning: result.existing,
        arrays_success: result.created,
      },
    };
  }

  @Post('bulk-info-participants')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sincroniza masivamente los participantes desde Workuse (userinfo2) — crea, actualiza y reactiva según corresponda, sin eliminar información existente. ' +
      'Corre en segundo plano: la respuesta HTTP no espera a que termine (puede tardar varios minutos) para evitar timeouts de proxy/gateway. ' +
      'El resultado final se loguea y se notifica por correo al admin.',
  })
  @ApiOkResponse({ type: BulkInfoParticipantsResponseDto })
  @ApiConflictResponse({ description: 'Ya hay una sincronización de participantes en curso.' })
  bulkInfoParticipantsHandler(): BulkInfoParticipantsResponseDto {
    // El botón del frontend no se puede bloquear de forma confiable (varias personas pueden
    // dispararlo a la vez) — se corta acá antes de arrancar otro batch completo en paralelo,
    // que terminaría pisando las mismas filas que la corrida ya en curso. Se lanza como
    // excepción (409) para que el AllExceptionsFilter arme { success: false, ... } y el
    // frontend pueda distinguirlo de una respuesta exitosa normal.
    if (this.bulkInfoParticipants.isSyncInProgress()) {
      throw new ConflictException(
        'Ya hay una sincronización de participantes en curso. Espera a que termine antes de iniciar otra.',
      );
    }

    // No se espera esta promesa a propósito (fire-and-forget) — un batch completo puede tardar
    // varios minutos y cualquier proxy delante del server cortaría la conexión mucho antes de que
    // termine. El propio use case ya loguea el resultado y notifica al admin por correo al acabar.
    this.bulkInfoParticipants.execute().catch(() => {
      // Ya logueado y notificado dentro del use case — este catch solo evita una unhandled rejection.
    });
    return {
      message: 'Sincronización de participantes iniciada en segundo plano. El resultado se notificará por correo al finalizar.',
    };
  }

  @Post('info-participant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sincroniza un solo participante desde Workuse (userinfo2) por DNI — crea, actualiza o reactiva según corresponda. ' +
      'A diferencia de bulk-info-participants, se ejecuta de forma síncrona (no es background job) y no notifica por correo al admin.',
  })
  @ApiOkResponse({ type: InfoParticipantResponseDto })
  @ApiNotFoundResponse({ description: 'Participante no encontrado en Workuse o país no encontrado en la base de datos.' })
  @ApiBadRequestResponse({ description: 'El participante no pertenece a Perú / WAT USA.' })
  async infoParticipantHandler(@Body() dto: InfoParticipantDto): Promise<InfoParticipantResponseDto> {
    const result = await this.infoParticipant.execute(dto.dni);
    const messageByAction: Record<string, string> = {
      created: 'Participante creado correctamente.',
      updated: 'Participante actualizado correctamente.',
      reactivated: 'Participante reactivado correctamente.',
    };
    return { message: messageByAction[result.action] };
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuarios (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(
    @Query() query: FindUsersQueryDto,
  ): Promise<PaginationResultDto<UserResponseDto>> {
    const result = await this.findAllUser.execute(query);
    return toPaginationResult(
      result.data as UserResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('staff')
  @ApiOperation({ summary: 'Listar staff (paginado) — excluye rol Participante' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAllStaffHandler(
    @Query() query: FindUsersQueryDto,
  ): Promise<PaginationResultDto<UserResponseDto>> {
    const result = await this.findAllStaff.execute(query);
    return toPaginationResult(
      result.data as UserResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exportar a Excel el estado de documentos de los usuarios — sin paginación, por defecto rol Participante',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'Archivo Excel (.xlsx) con el estado de documentos por usuario.' })
  async exportDocumentsStatus(
    @Query() query: ExportUsersQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.exportParticipantsDocuments.execute({
      status: query.status,
      roleId: query.roleId,
      countryId: query.countryId,
      sponsorId: query.sponsorId,
      hasSponsor: query.hasSponsor,
      programId: query.programId,
      optionProgramId: query.optionProgramId,
      statusSolRetiro: query.statusSolRetiro,
      generalStatus: query.generalStatus,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="document-status-report.xlsx"');
    res.send(buffer);
  }

  @Patch('update-user')
  @ApiOperation({ summary: 'Actualizar perfil del usuario (datos personales)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  updateProfile(@Body() dto: UpdateUserProfileDto) {
    return this.updateUserProfile.execute(dto);
  }

  @Post('upload-avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir avatar del usuario (sube a AWS S3 y actualiza el perfil)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'userId'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen (jpeg, png, webp, gif, avif — máx. 10 MB)',
        },
        userId: { type: 'string', format: 'uuid', example: 'uuid-del-usuario' },
      },
    },
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({ description: 'Archivo inválido o ausente.' })
  uploadUserAvatar(
    @UploadedFile(new ParseImagePipe()) file: MulterFile,
    @Body() dto: UploadAvatarDto,
  ) {
    return this.uploadAvatar.execute(dto.userId, file);
  }

  @Post('change-password-interno')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar contraseña validando la contraseña actual',
  })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({
    description: 'El usuario no tiene contraseña configurada.',
  })
  @ApiUnauthorizedResponse({
    description: 'La contraseña actual es incorrecta.',
  })
  async changeUserPassword(
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    await this.changePassword.execute(dto);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  @Post('change-password-admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cambiar la contraseña de un usuario (staff) sin validar la contraseña actual — no aplica a usuarios con rol Participante',
  })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({
    description: 'El usuario tiene rol Participante y no puede cambiarse por este endpoint.',
  })
  async adminChangeUserPassword(
    @Body() dto: AdminChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    await this.adminChangePassword.execute(dto);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  @Post('observations')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Crear observación para un participante — cambia su estado a OBSERVADO y crea historial' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['participantId', 'createdById', 'observation'],
      properties: {
        participantId: { type: 'string', format: 'uuid', example: 'uuid-del-participante' },
        createdById: { type: 'string', format: 'uuid', example: 'uuid-del-usuario-que-observa' },
        observation: { type: 'string', example: 'El participante no ha completado los documentos.' },
        etiquetaIds: { type: 'string', example: '["uuid-etiqueta-1","uuid-etiqueta-2"]', description: 'JSON string de UUIDs de etiquetas (opcional)' },
        files: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Archivos adjuntos (opcional, máx. 10)' },
      },
    },
  })
  @ApiCreatedResponse({ type: ObservationResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiNotFoundResponse({ description: 'Participante no encontrado.' })
  addObservation(
    @Body() dto: CreateObservationDto,
    @UploadedFiles() files?: MulterFile[],
  ) {
    return this.createObservation.execute(dto, files);
  }

  @Patch('observations/:id/close')
  @ApiOperation({ summary: 'Cerrar observación — recalcula el estado del participante según sus documentos' })
  @ApiParam({ name: 'id', description: 'UUID de la observación' })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiNotFoundResponse({ description: 'Observación no encontrada.' })
  async closeObservationHandler(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.closeObservation.execute(id, user.sub);
    return { message: 'Observación cerrada correctamente.' };
  }

  @Patch('change-status')
  @ApiOperation({
    summary: 'Cambiar el estado del usuario validando el estado actual',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiConflictResponse({
    description:
      'El estado actual enviado no coincide con el estado registrado.',
  })
  changeStatus(@CurrentUser() user: JwtPayload, @Body() dto: ChangeUserStatusDto) {
    return this.changeUserStatus.execute(dto, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiQuery({
    name: 'procesoId',
    required: false,
    description:
      'Acota el detalle a un ciclo del participante: sus documentos, observaciones, correos e ' +
      'historial. Sin él se devuelve el ciclo en curso. Un id que no sea de ese participante se ignora.',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('procesoId') procesoId?: string,
  ) {
    return this.findOneUser.execute(id, procesoId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  @ApiConflictResponse({ description: 'El nombre de usuario o el correo electrónico ya están en uso.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.updateUser.execute(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.deleteUser.execute(id);
    return { message: 'Usuario eliminado correctamente.' };
  }
}
