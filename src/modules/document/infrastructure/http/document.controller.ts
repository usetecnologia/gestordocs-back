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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import type { MulterFile } from '@modules/user-documents/domain/multer-file.interface';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { CreateDocumentUseCase } from '../../application/use-cases/create-document.use-case';
import { FindAllDocumentUseCase } from '../../application/use-cases/find-all-document.use-case';
import { FindOneDocumentUseCase } from '../../application/use-cases/find-one-document.use-case';
import { FindDocumentCountriesUseCase } from '../../application/use-cases/find-document-countries.use-case';
import { FindPendingDocumentsUseCase } from '../../application/use-cases/find-pending-documents.use-case';
import { FindAllActiveDocumentsUseCase } from '../../application/use-cases/find-all-active-documents.use-case';
import { UpdateDocumentUseCase } from '../../application/use-cases/update-document.use-case';
import { UpdateDocumentOrderUseCase } from '../../application/use-cases/update-document-order.use-case';
import { NormalizeDocumentOrderUseCase } from '../../application/use-cases/normalize-document-order.use-case';
import { DeleteDocumentUseCase } from '../../application/use-cases/delete-document.use-case';
import { CreateDocumentDto } from './dtos/create-document.dto';
import { UpdateDocumentDto } from './dtos/update-document.dto';
import { UpdateDocumentOrderDto } from './dtos/update-document-order.dto';
import { DocumentCountryResponseDto, DocumentResponseDto } from './dtos/document-response.dto';
import { FindDocumentsQueryDto } from './dtos/find-documents-query.dto';
import { TestDocumentAiExtractionDto } from './dtos/test-document-ai-extraction.dto';
import { ParseAiSampleFilePipe } from './pipes/parse-ai-sample-file.pipe';
import { TestDocumentAiExtractionUseCase } from '../../application/use-cases/test-document-ai-extraction.use-case';
import { FindDocumentAiPromptUseCase } from '../../application/use-cases/find-document-ai-prompt.use-case';
import { DocumentAiProfile } from '../../domain/document.enums';

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
    private readonly findDocumentCountries: FindDocumentCountriesUseCase,
    private readonly findPendingDocuments: FindPendingDocumentsUseCase,
    private readonly updateDocument: UpdateDocumentUseCase,
    private readonly updateDocumentOrder: UpdateDocumentOrderUseCase,
    private readonly normalizeDocumentOrder: NormalizeDocumentOrderUseCase,
    private readonly deleteDocument: DeleteDocumentUseCase,
    private readonly findAllActiveDocuments: FindAllActiveDocumentsUseCase,
    private readonly testDocumentAiExtraction: TestDocumentAiExtractionUseCase,
    private readonly findDocumentAiPrompt: FindDocumentAiPromptUseCase,
  ) {}

  @Get('ai/prompt')
  @ApiOperation({
    summary: 'Prompt base de la IA para un perfil',
    description: 'Devuelve el prompt base tal como lo recibe la IA, para mostrarlo en el formulario.',
  })
  @ApiQuery({ name: 'profile', required: false, enum: DocumentAiProfile })
  @ApiOkResponse({ description: 'Prompt base y encabezado de las instrucciones adicionales.' })
  @ApiBadRequestResponse({ description: 'Perfil desconocido.' })
  findAiPrompt(@Query('profile') profile?: string) {
    const resolved = (profile ?? DocumentAiProfile.PASSPORT) as DocumentAiProfile;
    if (!Object.values(DocumentAiProfile).includes(resolved)) {
      throw new BadRequestException(`Perfil de IA desconocido: ${profile}.`);
    }
    return this.findDocumentAiPrompt.execute(resolved);
  }

  @Post('ai/test-extraction')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Probar la extracción con IA sobre un archivo de muestra',
    description:
      'Extrae los datos del archivo con el perfil e instrucciones enviados (aunque no estén guardados) ' +
      'e indica qué se obtuvo y qué no. No guarda nada ni modifica ningún documento.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'profile'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Imagen JPG/PNG/WEBP o PDF (máx. 15 MB)' },
        profile: { type: 'string', enum: ['PASSPORT'] },
        instructions: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Reporte de la extracción.' })
  @ApiBadRequestResponse({ description: 'Archivo ausente, demasiado grande o de formato no soportado.' })
  testAiExtraction(
    @UploadedFile(new ParseAiSampleFilePipe()) file: MulterFile,
    @Body() dto: TestDocumentAiExtractionDto,
  ) {
    return this.testDocumentAiExtraction.execute({
      profile: dto.profile,
      instructions: dto.instructions ?? null,
      file,
    });
  }

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

  @Get('active')
  @ApiOperation({ summary: 'Listar todos los documentos activos (sin paginación)' })
  @ApiOkResponse({ type: [DocumentResponseDto] })
  findAllActive() {
    return this.findAllActiveDocuments.execute();
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

  @Get(':id/countries')
  @ApiOperation({
    summary: 'Países a los que aplica el documento',
    description:
      'Retorna la lista de países (sin duplicados) asociados al documento a través de sus programas.',
  })
  @ApiParam({ name: 'id', description: 'UUID del documento' })
  @ApiOkResponse({ type: [DocumentCountryResponseDto] })
  @ApiNotFoundResponse({ description: 'Documento no encontrado.' })
  findCountries(@Param('id', ParseUUIDPipe) id: string) {
    return this.findDocumentCountries.execute(id);
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

  @Post('normalize-order')
  @ApiOperation({
    summary: 'Normalizar el orden de todos los documentos',
    description:
      'Recalcula el campo `order` de todos los documentos según el orden de listado actual ' +
      '(order asc con nulls al final, luego createdAt desc), dejando una secuencia limpia ' +
      '1..N sin huecos ni valores duplicados.',
  })
  @ApiOkResponse({ type: [DocumentResponseDto] })
  normalizeOrder() {
    return this.normalizeDocumentOrder.execute();
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
