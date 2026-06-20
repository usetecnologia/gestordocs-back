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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import {
  PaginationResultDto,
  toPaginationResult,
} from '@common/dtos/pagination-result.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { CreateEtiquetaUseCase } from '../../application/use-cases/create-etiqueta.use-case';
import { FindAllEtiquetaUseCase } from '../../application/use-cases/find-all-etiqueta.use-case';
import { FindActiveEtiquetaUseCase } from '../../application/use-cases/find-active-etiqueta.use-case';
import { FindOneEtiquetaUseCase } from '../../application/use-cases/find-one-etiqueta.use-case';
import { UpdateEtiquetaUseCase } from '../../application/use-cases/update-etiqueta.use-case';
import { DeleteEtiquetaUseCase } from '../../application/use-cases/delete-etiqueta.use-case';
import { CreateEtiquetaDto } from './dtos/create-etiqueta.dto';
import { UpdateEtiquetaDto } from './dtos/update-etiqueta.dto';
import { EtiquetaResponseDto } from './dtos/etiqueta-response.dto';
import { FindEtiquetasQueryDto } from './dtos/find-etiquetas-query.dto';

@ApiTags('etiquetas')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'etiquetas', version: '1' })
export class EtiquetaController {
  constructor(
    private readonly createEtiqueta: CreateEtiquetaUseCase,
    private readonly findAllEtiqueta: FindAllEtiquetaUseCase,
    private readonly findActiveEtiqueta: FindActiveEtiquetaUseCase,
    private readonly findOneEtiqueta: FindOneEtiquetaUseCase,
    private readonly updateEtiqueta: UpdateEtiquetaUseCase,
    private readonly deleteEtiqueta: DeleteEtiquetaUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear etiqueta' })
  @ApiCreatedResponse({ type: EtiquetaResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  create(@Body() dto: CreateEtiquetaDto, @CurrentUser() user: JwtPayload) {
    return this.createEtiqueta.execute(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar etiquetas (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(
    @Query() query: FindEtiquetasQueryDto,
  ): Promise<PaginationResultDto<EtiquetaResponseDto>> {
    const result = await this.findAllEtiqueta.execute(query);
    return toPaginationResult(
      result.data as EtiquetaResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar etiquetas activas (sin paginación)' })
  @ApiOkResponse({ type: EtiquetaResponseDto, isArray: true })
  findActive() {
    return this.findActiveEtiqueta.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener etiqueta por ID' })
  @ApiParam({ name: 'id', description: 'UUID de la etiqueta' })
  @ApiOkResponse({ type: EtiquetaResponseDto })
  @ApiNotFoundResponse({ description: 'Etiqueta no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneEtiqueta.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar etiqueta' })
  @ApiParam({ name: 'id', description: 'UUID de la etiqueta' })
  @ApiOkResponse({ type: EtiquetaResponseDto })
  @ApiNotFoundResponse({ description: 'Etiqueta no encontrada.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEtiquetaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.updateEtiqueta.execute(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar etiqueta' })
  @ApiParam({ name: 'id', description: 'UUID de la etiqueta' })
  @ApiOkResponse({ description: 'Etiqueta eliminada correctamente.' })
  @ApiNotFoundResponse({ description: 'Etiqueta no encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteEtiqueta.execute(id);
  }
}
