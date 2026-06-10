import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  HttpCode, HttpStatus, UseGuards, Query, ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiCreatedResponse, ApiOkResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiBadRequestResponse, ApiUnauthorizedResponse, ApiConflictResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateRoleUseCase } from '../../application/use-cases/create-role.use-case';
import { FindAllRoleUseCase } from '../../application/use-cases/find-all-role.use-case';
import { FindActiveRoleUseCase } from '../../application/use-cases/find-active-role.use-case';
import { FindOneRoleUseCase } from '../../application/use-cases/find-one-role.use-case';
import { UpdateRoleUseCase } from '../../application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from '../../application/use-cases/delete-role.use-case';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { RoleResponseDto } from './dtos/role-response.dto';
import { FindRolesQueryDto } from './dtos/find-roles-query.dto';

@ApiTags('roles')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'roles', version: '1' })
export class RoleController {
  constructor(
    private readonly createRole: CreateRoleUseCase,
    private readonly findAllRole: FindAllRoleUseCase,
    private readonly findActiveRole: FindActiveRoleUseCase,
    private readonly findOneRole: FindOneRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear rol' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  create(@Body() dto: CreateRoleDto) {
    return this.createRole.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar roles (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindRolesQueryDto): Promise<PaginationResultDto<RoleResponseDto>> {
    const result = await this.findAllRole.execute(query);
    return toPaginationResult(result.data as RoleResponseDto[], result.total, query.page ?? 1, query.limit ?? 20);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar roles activos (sin paginación)' })
  @ApiOkResponse({ type: RoleResponseDto, isArray: true })
  findActive() {
    return this.findActiveRole.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener rol por ID' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ description: 'Rol no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneRole.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar rol' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse({ description: 'Rol no encontrado.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.updateRole.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar rol' })
  @ApiNoContentResponse({ description: 'Rol eliminado.' })
  @ApiNotFoundResponse({ description: 'Rol no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteRole.execute(id);
  }
}
