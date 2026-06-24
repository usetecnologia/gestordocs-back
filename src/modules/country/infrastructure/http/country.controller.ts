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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateCountryUseCase } from '../../application/use-cases/create-country.use-case';
import { FindAllCountryUseCase } from '../../application/use-cases/find-all-country.use-case';
import { FindActiveCountryUseCase } from '../../application/use-cases/find-active-country.use-case';
import { FindOneCountryUseCase } from '../../application/use-cases/find-one-country.use-case';
import { UpdateCountryUseCase } from '../../application/use-cases/update-country.use-case';
import { DeleteCountryUseCase } from '../../application/use-cases/delete-country.use-case';
import { CreateCountryDto } from './dtos/create-country.dto';
import { UpdateCountryDto } from './dtos/update-country.dto';
import { CountryResponseDto } from './dtos/country-response.dto';
import { FindCountriesQueryDto } from './dtos/find-countries-query.dto';

@ApiTags('countries')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'countries', version: '1' })
export class CountryController {
  constructor(
    private readonly createCountry: CreateCountryUseCase,
    private readonly findAllCountry: FindAllCountryUseCase,
    private readonly findActiveCountry: FindActiveCountryUseCase,
    private readonly findOneCountry: FindOneCountryUseCase,
    private readonly updateCountry: UpdateCountryUseCase,
    private readonly deleteCountry: DeleteCountryUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear país' })
  @ApiCreatedResponse({ type: CountryResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  create(@Body() dto: CreateCountryDto) {
    return this.createCountry.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar países (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindCountriesQueryDto): Promise<PaginationResultDto<CountryResponseDto>> {
    const result = await this.findAllCountry.execute(query);
    return toPaginationResult(result.data as CountryResponseDto[], result.total, query.page ?? 1, query.limit ?? 20);
  }

  @Get('active')
  @ApiOperation({ summary: 'Listar países activos (sin paginación)' })
  @ApiOkResponse({ type: CountryResponseDto, isArray: true })
  findActive() {
    return this.findActiveCountry.execute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener país por ID' })
  @ApiOkResponse({ type: CountryResponseDto })
  @ApiNotFoundResponse({ description: 'País no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneCountry.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar país' })
  @ApiOkResponse({ type: CountryResponseDto })
  @ApiNotFoundResponse({ description: 'País no encontrado.' })
  @ApiConflictResponse({ description: 'Código ya en uso.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCountryDto) {
    return this.updateCountry.execute(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar país' })
  @ApiOkResponse({ schema: { example: { message: 'País eliminado correctamente.' } } })
  @ApiNotFoundResponse({ description: 'País no encontrado.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.deleteCountry.execute(id);
    return { message: 'País eliminado correctamente.' };
  }
}
