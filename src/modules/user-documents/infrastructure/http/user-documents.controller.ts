import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnyFilesInterceptor, FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MulterFile } from '../../domain/multer-file.interface';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { UploadFileDocumentUseCase } from '../../application/use-cases/upload-file-document.use-case';
import { FindUserDocumentsUseCase } from '../../application/use-cases/find-user-documents.use-case';
import { AceptarDocumentUseCase } from '../../application/use-cases/aceptar-document.use-case';
import { ObservarDocumentUseCase } from '../../application/use-cases/observar-document.use-case';
import { BulkUploadByFilenameUseCase } from '../../application/use-cases/bulk-upload-by-filename.use-case';
import { TerminarRevisionUseCase } from '../../application/use-cases/terminar-revision.use-case';
import { BulkTerminarRevisionUseCase } from '../../application/use-cases/bulk-terminar-revision.use-case';
import { DownloadDocumentsBySponsorUseCase } from '../../application/use-cases/download-documents-by-sponsor.use-case';
import { BulkDownloadDocumentsBySponsorUseCase } from '../../application/use-cases/bulk-download-documents-by-sponsor.use-case';
import { UploadFileDocumentDto } from './dtos/upload-file-document.dto';
import { BulkDownloadBySponsorDto } from './dtos/bulk-download-by-sponsor.dto';
import { UserDocumentWithHistoryDto } from './dtos/find-user-documents-response.dto';
import { AceptarDocumentDto, ObservarDocumentDto } from './dtos/review-document.dto';
import { FindUserDocumentsQueryDto } from './dtos/find-user-documents-query.dto';
import { BulkUploadByFilenameResponseDto } from './dtos/bulk-upload-by-filename-response.dto';
import { TerminarRevisionDto } from './dtos/terminar-revision.dto';
import { TerminarRevisionMasivoResponseDto } from './dtos/terminar-revision-masivo-response.dto';
import { MaxFileSizePipe } from './pipes/max-file-size.pipe';

@ApiTags('user-documents')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'user-documents', version: '1' })
export class UserDocumentsController {
  constructor(
    private readonly uploadFileDocumentUseCase: UploadFileDocumentUseCase,
    private readonly findUserDocumentsUseCase: FindUserDocumentsUseCase,
    private readonly aceptarDocumentUseCase: AceptarDocumentUseCase,
    private readonly observarDocumentUseCase: ObservarDocumentUseCase,
    private readonly bulkUploadByFilenameUseCase: BulkUploadByFilenameUseCase,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    private readonly bulkTerminarRevisionUseCase: BulkTerminarRevisionUseCase,
    private readonly downloadDocumentsBySponsorUseCase: DownloadDocumentsBySponsorUseCase,
    private readonly bulkDownloadDocumentsBySponsorUseCase: BulkDownloadDocumentsBySponsorUseCase,
  ) {}

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Listar documentos con historial de un usuario' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiQuery({ name: 'filter', required: false, enum: ['ALL', 'REQUIRED', 'OBSERVED'], description: 'ALL: todos | REQUIRED: obligatorios | OBSERVED: observados' })
  @ApiOkResponse({ type: [UserDocumentWithHistoryDto] })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: FindUserDocumentsQueryDto,
  ): Promise<UserDocumentWithHistoryDto[]> {
    return this.findUserDocumentsUseCase.execute(userId, query.filter);
  }

  @Get('download-by-sponsor/:userId')
  @ApiOperation({
    summary: 'Descargar los documentos del participante según su sponsor',
    description:
      'ASPIRE: combina PASSPORT, JOASPIRE, ULETTER y TRANSLATION en un solo PDF (con sello en TRANSLATION). ' +
      'UNITED: genera un .zip con una carpeta {dni}_{apellidos, nombres} conteniendo PROOF.pdf (UWTPOSS), ' +
      'ULETTER.pdf (ULETTER+TRANSLATION), PBC.pdf (PBC+PBC2), PASSPORT.pdf y JO.pdf (SPONSOR).',
  })
  @ApiParam({ name: 'userId', description: 'UUID del participante' })
  @ApiProduces('application/pdf', 'application/zip')
  @ApiOkResponse({ description: 'Archivo PDF (ASPIRE) o ZIP (UNITED) con los documentos.' })
  @ApiNotFoundResponse({ description: 'Participante no encontrado o sin documentos subidos.' })
  @ApiBadRequestResponse({ description: 'El participante no pertenece a un sponsor soportado (ASPIRE o UNITED).' })
  async downloadBySponsor(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType } = await this.downloadDocumentsBySponsorUseCase.execute(userId);

    const asciiFallback = filename
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7E]/g, '');

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @Post('download-by-sponsor/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Descargar de forma masiva los documentos de varios participantes, agrupados por sponsor',
    description:
      'Recibe hasta 100 DNIs. Genera documentos_sponsor.zip con dos carpetas: ASPIRE (un PDF combinado y sellado ' +
      'por participante) y UNITED (una subcarpeta {dni} - {apellidos, nombres} por participante con PROOF, ULETTER, ' +
      'PBC, PASSPORT y JO). Los DNIs no encontrados, sin sponsor soportado o sin documentos NO detienen el proceso: ' +
      'se omiten y se listan en el header X-Skipped-Participants como JSON codificado con encodeURIComponent.',
  })
  @ApiProduces('application/zip')
  @ApiHeader({
    name: 'X-Skipped-Participants',
    description:
      'JSON (URI-encoded) con los DNIs omitidos: [{ dni, fullName, reason }]',
    required: false,
  })
  @ApiOkResponse({ description: 'Archivo .zip con los documentos agrupados por sponsor.' })
  @ApiNotFoundResponse({ description: 'Ningún participante tiene documentos disponibles para descargar.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  async downloadBySponsorBulk(
    @Body() dto: BulkDownloadBySponsorDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType, skipped } = await this.bulkDownloadDocumentsBySponsorUseCase.execute(
      dto.dnis,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Skipped-Participants', encodeURIComponent(JSON.stringify(skipped)));
    res.send(buffer);
  }

  @Post('aceptar-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar un documento — cambia estado a REVISADO' })
  @ApiOkResponse({ description: 'Documento aceptado correctamente.' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  async aceptarDocument(
    @Body() dto: AceptarDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.aceptarDocumentUseCase.execute(dto.userDocumentId, user.sub);
    return { message: 'Documento aceptado correctamente.' };
  }

  @Post('observar-document')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Observar un documento — cambia estado a OBSERVADO y registra observación con etiquetas' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userDocumentId', 'observation', 'etiquetaIds'],
      properties: {
        userDocumentId: { type: 'string', format: 'uuid', example: 'uuid-del-user-document' },
        observation: { type: 'string', example: 'El documento está incompleto, falta la firma.' },
        etiquetaIds: { type: 'string', example: '["uuid-etiqueta-1","uuid-etiqueta-2"]', description: 'JSON string de UUIDs de etiquetas' },
        files: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'Archivos adjuntos (opcional, máx. 10)' },
      },
    },
  })
  @ApiOkResponse({ description: 'Documento observado correctamente.' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  async observarDocument(
    @Body() dto: ObservarDocumentDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFiles() files?: MulterFile[],
  ) {
    await this.observarDocumentUseCase.execute(dto, user.sub, files);
    return { message: 'Documento observado correctamente.' };
  }

  @Post('upload-file-document')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file for a user document — creates a new SUBIDO history entry' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'userDocumentId', 'userCreatedId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo (máx. 10 MB)' },
        userDocumentId: { type: 'string', format: 'uuid', example: 'uuid-del-user-document' },
        userCreatedId: { type: 'string', format: 'uuid', example: 'uuid-del-user-creador' },
      },
    },
  })
  @ApiOkResponse({ description: 'File uploaded and history created successfully' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  @ApiConflictResponse({ description: 'Los documentos del usuario están en revisión.' })
  async uploadFileDocument(
    @UploadedFile(new MaxFileSizePipe()) file: MulterFile,
    @Body() dto: UploadFileDocumentDto,
  ) {
    await this.uploadFileDocumentUseCase.execute(file, dto);
    return { message: 'Archivo subido correctamente.' };
  }

  @Post('terminar-revision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Terminar revisión — evalúa documentos del participante y actualiza su estado' })
  @ApiOkResponse({ schema: { example: { message: 'Revisión finalizada correctamente.' } } })
  @ApiNotFoundResponse({ description: 'Participante no encontrado.' })
  async terminarRevision(@Body() dto: TerminarRevisionDto) {
    await this.terminarRevisionUseCase.execute(dto.participantId, dto.createdById);
    return { message: 'Revisión finalizada correctamente.' };
  }

  @Post('terminar-revision-masivo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Terminar revisión de forma masiva — evalúa y actualiza el estado de todos los participantes',
  })
  @ApiOkResponse({ type: TerminarRevisionMasivoResponseDto })
  async terminarRevisionMasivo(): Promise<TerminarRevisionMasivoResponseDto> {
    const result = await this.bulkTerminarRevisionUseCase.execute();
    return { message: 'Revisión masiva finalizada.', ...result };
  }

  @Post('bulk-upload-by-filename')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Carga masiva de documentos por nombre de archivo',
    description:
      'Recibe múltiples archivos con nombre en formato `{dni}_{siglas}.{extension}` y los vincula automáticamente al usuario y documento correspondiente. ' +
      'El status se valida sin distinción de mayúsculas/minúsculas. ' +
      'Si el status es inválido se corta todo. Si un usuario o sigla no existe, se continúa con los demás.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status', 'files'],
      properties: {
        status: {
          type: 'string',
          example: 'SUBIDO',
          description: 'Estado del documento (PENDIENTE | SUBIDO | EN_REVISION | OBSERVADO | REVISADO) — no distingue mayúsculas/minúsculas',
        },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Archivos con nombre {dni}_{siglas}.{extension} (máx. 15 MB c/u)',
        },
      },
    },
  })
  @ApiOkResponse({ type: BulkUploadByFilenameResponseDto })
  bulkUploadByFilename(
    @Body('status') status: string,
    @UploadedFiles() files: MulterFile[],
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkUploadByFilenameResponseDto> {
    return this.bulkUploadByFilenameUseCase.execute(status, files ?? [], user.sub);
  }
}
