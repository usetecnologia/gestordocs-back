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
import { CreateSponsorUseCase } from '../../application/use-cases/create-sponsor.use-case';
import { FindAllSponsorUseCase } from '../../application/use-cases/find-all-sponsor.use-case';
import { FindActiveSponsorUseCase } from '../../application/use-cases/find-active-sponsor.use-case';
import { FindOneSponsorUseCase } from '../../application/use-cases/find-one-sponsor.use-case';
import { UpdateSponsorUseCase } from '../../application/use-cases/update-sponsor.use-case';
import { DeleteSponsorUseCase } from '../../application/use-cases/delete-sponsor.use-case';
import { CreateSponsorDto } from './dtos/create-sponsor.dto';
import { UpdateSponsorDto } from './dtos/update-sponsor.dto';
import { SponsorResponseDto } from './dtos/sponsor-response.dto';
import { FindSponsorsQueryDto } from './dtos/find-sponsors-query.dto';

@ApiTags('sponsors')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'sponsors', version: '1' })
export class SponsorController {
  constructor(
    private readonly createSponsor: CreateSponsorUseCase,
    private readonly findAllSponsor: FindAllSponsorUseCase,
    private readonly findActiveSponsor: FindActiveSponsorUseCase,
    private readonly findOneSponsor: FindOneSponsorUseCase,
    private readonly updateSponsor: UpdateSponsorUseCase,
    private readonly deleteSponsor: DeleteSponsorUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear sponsor' })
  @ApiCreatedResponse({ type: SponsorResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  create(@Body() dto: CreateSponsorDto) {
    return this.createSponsor.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar sponsors (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindSponsorsQueryDto): Promise<PaginationResultDto<SponsorResponseDto>> {
    const result = await this.findAllSponsor.execute(query);
    return toPaginationResult(result.data as SponsorResponseDto[], result.total, query.page ?? 1, query.limit ?? 20);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar sponsors activos (sin paginación)' })
  @ApiOkResponse({ type: SponsorResponseDto, isArray: true })
  findActive() {
    return this.findActiveSponsor.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener sponsor por ID' })
  @ApiOkResponse({ type: SponsorResponseDto })
  @ApiNotFoundResponse({ description: 'Sponsor no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneSponsor.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar sponsor' })
  @ApiOkResponse({ type: SponsorResponseDto })
  @ApiNotFoundResponse({ description: 'Sponsor no encontrado.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSponsorDto) {
    return this.updateSponsor.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar sponsor' })
  @ApiNoContentResponse({ description: 'Sponsor eliminado.' })
  @ApiNotFoundResponse({ description: 'Sponsor no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteSponsor.execute(id);
  }
}
