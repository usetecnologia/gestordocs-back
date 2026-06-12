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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { CreateDocumentUseCase } from '../../application/use-cases/create-document.use-case';
import { FindAllDocumentUseCase } from '../../application/use-cases/find-all-document.use-case';
import { FindOneDocumentUseCase } from '../../application/use-cases/find-one-document.use-case';
import { UpdateDocumentUseCase } from '../../application/use-cases/update-document.use-case';
import { DeleteDocumentUseCase } from '../../application/use-cases/delete-document.use-case';
import { CreateDocumentDto } from './dtos/create-document.dto';
import { UpdateDocumentDto } from './dtos/update-document.dto';
import { DocumentResponseDto } from './dtos/document-response.dto';
import { FindDocumentsQueryDto } from './dtos/find-documents-query.dto';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'documents', version: '1' })
export class DocumentController {
  constructor(
    private readonly createDocument: CreateDocumentUseCase,
    private readonly findAllDocument: FindAllDocumentUseCase,
    private readonly findOneDocument: FindOneDocumentUseCase,
    private readonly updateDocument: UpdateDocumentUseCase,
    private readonly deleteDocument: DeleteDocumentUseCase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Crear documento',
    description: 'Crea un documento y opcionalmente lo asocia a uno o varios sponsors.',
  })
  @ApiCreatedResponse({ type: DocumentResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: JwtPayload) {
    return this.createDocument.execute(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar documentos (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(
    @Query() query: FindDocumentsQueryDto,
  ): Promise<PaginationResultDto<DocumentResponseDto>> {
    const result = await this.findAllDocument.execute(query);
    return toPaginationResult(
      result.data as DocumentResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener documento por ID (incluye sponsors asociados)' })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiOkResponse({ type: DocumentResponseDto })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneDocument.execute(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar documento',
    description:
      'Actualiza campos del documento. Si se envía `sponsorIds`, reemplaza completamente los sponsors asociados (array vacío para desvincular todos).',
  })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiOkResponse({ type: DocumentResponseDto })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.updateDocument.execute(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar documento y sus asociaciones con sponsors' })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiNoContentResponse({ description: 'Documento eliminado.' })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteDocument.execute(id);
  }
}
