import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
  ApiUnauthorizedResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateTemporadaUseCase } from '../../application/use-cases/create-temporada.use-case';
import { FindAllTemporadaUseCase } from '../../application/use-cases/find-all-temporada.use-case';
import { FindActiveTemporadasUseCase } from '../../application/use-cases/find-active-temporadas.use-case';
import { FindOneTemporadaUseCase } from '../../application/use-cases/find-one-temporada.use-case';
import { UpdateTemporadaUseCase } from '../../application/use-cases/update-temporada.use-case';
import { ToggleTemporadaStatusUseCase } from '../../application/use-cases/toggle-temporada-status.use-case';
import { DeleteTemporadaUseCase } from '../../application/use-cases/delete-temporada.use-case';
import { CreateTemporadaDto } from './dtos/create-temporada.dto';
import { UpdateTemporadaDto } from './dtos/update-temporada.dto';
import { TemporadaResponseDto } from './dtos/temporada-response.dto';
import { FindTemporadasQueryDto } from './dtos/find-temporadas-query.dto';
import { FindActiveTemporadasQueryDto } from './dtos/find-active-temporadas-query.dto';

@ApiTags('temporadas')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'temporadas', version: '1' })
export class TemporadaController {
  constructor(
    private readonly createTemporada: CreateTemporadaUseCase,
    private readonly findAllTemporada: FindAllTemporadaUseCase,
    private readonly findActiveTemporadas: FindActiveTemporadasUseCase,
    private readonly findOneTemporada: FindOneTemporadaUseCase,
    private readonly updateTemporada: UpdateTemporadaUseCase,
    private readonly toggleTemporadaStatus: ToggleTemporadaStatusUseCase,
    private readonly deleteTemporada: DeleteTemporadaUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear temporada' })
  @ApiCreatedResponse({ type: TemporadaResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  create(@Body() dto: CreateTemporadaDto) {
    return this.createTemporada.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar temporadas de un programa (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(
    @Query() query: FindTemporadasQueryDto,
  ): Promise<PaginationResultDto<TemporadaResponseDto>> {
    const result = await this.findAllTemporada.execute(query);
    return toPaginationResult(
      result.data as TemporadaResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('active')
  @ApiOperation({
    summary: 'Listar temporadas activas de uno o más programas',
    description:
      'Retorna solo las temporadas con estado activo que pertenecen a los programas indicados.',
  })
  @ApiQuery({
    name: 'programIds',
    required: true,
    example: 'uuid-programa-1,uuid-programa-2',
    description: 'IDs de programas separados por coma (uno o más).',
  })
  @ApiOkResponse({ type: [TemporadaResponseDto] })
  @ApiBadRequestResponse({ description: 'programIds es requerido y debe contener UUIDs válidos.' })
  findActive(@Query() query: FindActiveTemporadasQueryDto) {
    return this.findActiveTemporadas.execute(query.programIds);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener temporada por ID' })
  @ApiParam({ name: 'id', description: 'UUID de la temporada' })
  @ApiOkResponse({ type: TemporadaResponseDto })
  @ApiNotFoundResponse({ description: 'Temporada no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneTemporada.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar temporada' })
  @ApiParam({ name: 'id', description: 'UUID de la temporada' })
  @ApiOkResponse({ type: TemporadaResponseDto })
  @ApiNotFoundResponse({ description: 'Temporada no encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemporadaDto) {
    return this.updateTemporada.execute(id, dto);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Activar o inactivar temporada (invierte su estado)' })
  @ApiParam({ name: 'id', description: 'UUID de la temporada' })
  @ApiOkResponse({ type: TemporadaResponseDto })
  @ApiNotFoundResponse({ description: 'Temporada no encontrada.' })
  toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.toggleTemporadaStatus.execute(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar temporada' })
  @ApiParam({ name: 'id', description: 'UUID de la temporada' })
  @ApiOkResponse({ schema: { example: { message: 'Temporada eliminada correctamente.' } } })
  @ApiNotFoundResponse({ description: 'Temporada no encontrada.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.deleteTemporada.execute(id);
    return { message: 'Temporada eliminada correctamente.' };
  }
}
