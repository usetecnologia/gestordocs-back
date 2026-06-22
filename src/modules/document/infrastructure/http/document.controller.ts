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
  BadRequestException,
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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { CreateDocumentUseCase } from '../../application/use-cases/create-document.use-case';
import { FindAllDocumentUseCase } from '../../application/use-cases/find-all-document.use-case';
import { FindOneDocumentUseCase } from '../../application/use-cases/find-one-document.use-case';
import { FindPendingDocumentsUseCase } from '../../application/use-cases/find-pending-documents.use-case';
import { UpdateDocumentUseCase } from '../../application/use-cases/update-document.use-case';
import { UpdateDocumentOrderUseCase } from '../../application/use-cases/update-document-order.use-case';
import { DeleteDocumentUseCase } from '../../application/use-cases/delete-document.use-case';
import { CreateDocumentDto } from './dtos/create-document.dto';
import { UpdateDocumentDto } from './dtos/update-document.dto';
import { UpdateDocumentOrderDto } from './dtos/update-document-order.dto';
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
    private readonly findPendingDocuments: FindPendingDocumentsUseCase,
    private readonly updateDocument: UpdateDocumentUseCase,
    private readonly updateDocumentOrder: UpdateDocumentOrderUseCase,
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

  @Get('pending')
  @ApiOperation({
    summary: 'Documentos pendientes por sponsor',
    description: 'Retorna todos los documentos que tienen asociado un sponsor específico, filtrado por el código del sponsor.',
  })
  @ApiQuery({ name: 'sponsorCode', required: true, example: 'ASPIRE', description: 'Código del sponsor' })
  @ApiOkResponse({ type: [DocumentResponseDto] })
  @ApiBadRequestResponse({ description: 'El parámetro sponsorCode es requerido.' })
  findPending(@Query('sponsorCode') sponsorCode: string) {
    if (!sponsorCode?.trim()) throw new BadRequestException('El parámetro sponsorCode es requerido.');
    return this.findPendingDocuments.execute(sponsorCode.trim());
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

  @Patch(':id/order')
  @ApiOperation({ summary: 'Actualizar orden del documento' })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiOkResponse({ type: DocumentResponseDto })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentOrderDto,
  ) {
    return this.updateDocumentOrder.execute(id, dto.order ?? null);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar documento y sus asociaciones con sponsors' })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiOkResponse({ description: 'Documento eliminado correctamente.' })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deleteDocument.execute(id);
  }
}
