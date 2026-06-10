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
import { CreateOptionProgramUseCase } from '../../application/use-cases/create-option-program.use-case';
import { FindAllOptionProgramUseCase } from '../../application/use-cases/find-all-option-program.use-case';
import { FindOneOptionProgramUseCase } from '../../application/use-cases/find-one-option-program.use-case';
import { UpdateOptionProgramUseCase } from '../../application/use-cases/update-option-program.use-case';
import { DeleteOptionProgramUseCase } from '../../application/use-cases/delete-option-program.use-case';
import { CreateOptionProgramDto } from './dtos/create-option-program.dto';
import { UpdateOptionProgramDto } from './dtos/update-option-program.dto';
import { OptionProgramResponseDto } from './dtos/option-program-response.dto';
import { FindOptionProgramsQueryDto } from './dtos/find-option-programs-query.dto';

@ApiTags('option-programs')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'option-programs', version: '1' })
export class OptionProgramController {
  constructor(
    private readonly createOptionProgram: CreateOptionProgramUseCase,
    private readonly findAllOptionProgram: FindAllOptionProgramUseCase,
    private readonly findOneOptionProgram: FindOneOptionProgramUseCase,
    private readonly updateOptionProgram: UpdateOptionProgramUseCase,
    private readonly deleteOptionProgram: DeleteOptionProgramUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear opción de programa' })
  @ApiCreatedResponse({ type: OptionProgramResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  create(@Body() dto: CreateOptionProgramDto) {
    return this.createOptionProgram.execute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar opciones de programa (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(@Query() query: FindOptionProgramsQueryDto): Promise<PaginationResultDto<OptionProgramResponseDto>> {
    const result = await this.findAllOptionProgram.execute(query);
    return toPaginationResult(
      result.data as OptionProgramResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener opción de programa por ID' })
  @ApiParam({ name: 'id', description: 'UUID de la opción de programa' })
  @ApiOkResponse({ type: OptionProgramResponseDto })
  @ApiNotFoundResponse({ description: 'Opción de programa no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneOptionProgram.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar opción de programa' })
  @ApiParam({ name: 'id', description: 'UUID de la opción de programa' })
  @ApiOkResponse({ type: OptionProgramResponseDto })
  @ApiNotFoundResponse({ description: 'Opción de programa no encontrada.' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOptionProgramDto) {
    return this.updateOptionProgram.execute(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar opción de programa' })
  @ApiParam({ name: 'id', description: 'UUID de la opción de programa' })
  @ApiNoContentResponse({ description: 'Opción de programa eliminada.' })
  @ApiNotFoundResponse({ description: 'Opción de programa no encontrada.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteOptionProgram.execute(id);
  }
}
