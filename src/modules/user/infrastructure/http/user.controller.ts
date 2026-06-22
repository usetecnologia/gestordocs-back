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
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ParseImagePipe } from '@common/pipes/parse-image.pipe';
import {
  PaginationResultDto,
  toPaginationResult,
} from '@common/dtos/pagination-result.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { FindAllUserUseCase } from '../../application/use-cases/find-all-user.use-case';
import { FindOneUserUseCase } from '../../application/use-cases/find-one-user.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { UpdateUserProfileUseCase } from '../../application/use-cases/update-user-profile.use-case';
import { UploadAvatarUseCase } from '../../application/use-cases/upload-avatar.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { ChangeUserStatusUseCase } from '../../application/use-cases/change-user-status.use-case';
import { CreateObservationUseCase } from '../../application/use-cases/create-observation.use-case';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';
import { UploadAvatarDto } from './dtos/upload-avatar.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { ChangePasswordResponseDto } from './dtos/change-password-response.dto';
import { ChangeUserStatusDto } from './dtos/change-user-status.dto';
import { CreateObservationDto } from './dtos/create-observation.dto';
import { ObservationResponseDto } from './dtos/observation-response.dto';
import { UserResponseDto } from './dtos/user-response.dto';
import { FindUsersQueryDto } from './dtos/find-users-query.dto';
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
    private readonly findOneUser: FindOneUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly updateUserProfile: UpdateUserProfileUseCase,
    private readonly uploadAvatar: UploadAvatarUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly changeUserStatus: ChangeUserStatusUseCase,
    private readonly createObservation: CreateObservationUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear usuario' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  create(@Body() dto: CreateUserDto) {
    return this.createUser.execute(dto);
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

  @Post('observations')
  @ApiOperation({ summary: 'Crear observación para un participante — cambia su estado a OBSERVADO y crea historial' })
  @ApiCreatedResponse({ type: ObservationResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiNotFoundResponse({ description: 'Participante no encontrado.' })
  addObservation(@Body() dto: CreateObservationDto) {
    return this.createObservation.execute(dto);
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
  changeStatus(@Body() dto: ChangeUserStatusDto) {
    return this.changeUserStatus.execute(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneUser.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.updateUser.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar usuario' })
  @ApiParam({ name: 'id', description: 'UUID del usuario' })
  @ApiNoContentResponse({ description: 'Usuario eliminado.' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteUser.execute(id);
  }
}
