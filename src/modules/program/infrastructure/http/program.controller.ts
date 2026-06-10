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
import { CreateProgramUseCase } from '../../application/use-cases/create-program.use-case';
import { FindAllProgramUseCase } from '../../application/use-cases/find-all-program.use-case';
import { FindActiveProgramUseCase } from '../../application/use-cases/find-active-program.use-case';
import { FindOneProgramUseCase } from '../../application/use-cases/find-one-program.use-case';
import { UpdateProgramUseCase } from '../../application/use-cases/update-program.use-case';
import { DeleteProgramUseCase } from '../../application/use-cases/delete-program.use-case';
import { CreateProgramDto } from './dtos/create-program.dto';
import { UpdateProgramDto } from './dtos/update-program.dto';
import { ProgramResponseDto } from './dtos/program-response.dto';
import { FindProgramsQueryDto } from './dtos/find-programs-query.dto';

@ApiTags('programs')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'programs', version: '1' })
export class ProgramController {
  constructor(
    private readonly createProgram: CreateProgramUseCase,
    private readonly findAllProgram: FindAllProgramUseCase,
    private readonly findActiveProgram: FindActiveProgramUseCase,
    private readonly findOneProgram: FindOneProgramUseCase,
    private readonly updateProgram: UpdateProgramUseCase,
    private readonly deleteProgram: DeleteProgramUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear programa' })
  @ApiCreatedResponse({ type: ProgramResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  create(@Body() dto: CreateProgramDto) {
    return this.createProgram.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar programas (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindProgramsQueryDto): Promise<PaginationResultDto<ProgramResponseDto>> {
    const result = await this.findAllProgram.execute(query);
    return toPaginationResult(result.data as ProgramResponseDto[], result.total, query.page ?? 1, query.limit ?? 20);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar programas activos (sin paginación)' })
  @ApiOkResponse({ type: ProgramResponseDto, isArray: true })
  findActive() {
    return this.findActiveProgram.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener programa por ID' })
  @ApiOkResponse({ type: ProgramResponseDto })
  @ApiNotFoundResponse({ description: 'Programa no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneProgram.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar programa' })
  @ApiOkResponse({ type: ProgramResponseDto })
  @ApiNotFoundResponse({ description: 'Programa no encontrado.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProgramDto) {
    return this.updateProgram.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar programa' })
  @ApiNoContentResponse({ description: 'Programa eliminado.' })
  @ApiNotFoundResponse({ description: 'Programa no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteProgram.execute(id);
  }
}
