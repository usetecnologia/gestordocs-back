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
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
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
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case';
import { FindAllUserUseCase } from '../../application/use-cases/find-all-user.use-case';
import { FindOneUserUseCase } from '../../application/use-cases/find-one-user.use-case';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from '../../application/use-cases/delete-user.use-case';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UserResponseDto } from './dtos/user-response.dto';
import { FindUsersQueryDto } from './dtos/find-users-query.dto';

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
  async findAll(@Query() query: FindUsersQueryDto): Promise<PaginationResultDto<UserResponseDto>> {
    const result = await this.findAllUser.execute(query);
    return toPaginationResult(
      result.data as UserResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
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
