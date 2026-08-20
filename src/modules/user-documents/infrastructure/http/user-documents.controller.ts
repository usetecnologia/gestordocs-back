import {
  Body,
  ConflictException,
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
import { FindInformativeDocumentsBySponsorsUseCase } from '../../application/use-cases/find-informative-documents-by-sponsors.use-case';
import { BulkAceptarDocumentUseCase } from '../../application/use-cases/bulk-aceptar-document.use-case';
import { BulkObservarDocumentUseCase } from '../../application/use-cases/bulk-observar-document.use-case';
import { BulkExtractPassportDataUseCase } from '../../application/use-cases/bulk-extract-passport-data.use-case';
import { DocumentResponseDto } from '@modules/document/infrastructure/http/dtos/document-response.dto';
import { UploadFileDocumentDto } from './dtos/upload-file-document.dto';
import { BulkDownloadBySponsorDto } from './dtos/bulk-download-by-sponsor.dto';
import { UserDocumentWithHistoryDto } from './dtos/find-user-documents-response.dto';
import { AceptarDocumentDto, ObservarDocumentDto } from './dtos/review-document.dto';
import { FindUserDocumentsQueryDto } from './dtos/find-user-documents-query.dto';
import { FindDocumentsBySponsorQueryDto } from './dtos/find-documents-by-sponsor-query.dto';
import { BulkUploadByFilenameResponseDto } from './dtos/bulk-upload-by-filename-response.dto';
import { TerminarRevisionDto } from './dtos/terminar-revision.dto';
import { TerminarRevisionMasivoResponseDto } from './dtos/terminar-revision-masivo-response.dto';
import { BulkAceptarDocumentDto } from './dtos/bulk-aceptar-document.dto';
import { BulkObservarDocumentDto } from './dtos/bulk-observar-document.dto';
import { BulkReviewDocumentResponseDto } from './dtos/bulk-review-document-response.dto';
import { RevisionMasivaPasaporteResponseDto } from './dtos/revision-masiva-pasaporte-response.dto';
import { MaxFileSizePipe } from './pipes/max-file-size.pipe';
import { ParseOptionalPdfPipe } from './pipes/parse-optional-pdf.pipe';

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
    private readonly findInformativeDocumentsBySponsorsUseCase: FindInformativeDocumentsBySponsorsUseCase,
    private readonly bulkAceptarDocumentUseCase: BulkAceptarDocumentUseCase,
    private readonly bulkObservarDocumentUseCase: BulkObservarDocumentUseCase,
    private readonly bulkExtractPassportDataUseCase: BulkExtractPassportDataUseCase,
  ) {}

  @Get('documents-by-sponsor')
  @ApiOperation({
    summary: 'Documentos informativos por sponsor',
    description:
      'Retorna todos los documentos de tipo INFORMATIVE asociados a los sponsors indicados, ' +
      'más los documentos INFORMATIVE generales (no asociados a ningún sponsor).',
  })
  @ApiQuery({
    name: 'sponsorIds',
    required: false,
    example: 'uuid-sponsor-1,uuid-sponsor-2',
    description:
      'IDs de sponsors separados por coma. Si se omite, se devuelven solo los documentos generales.',
  })
  @ApiOkResponse({ type: [DocumentResponseDto] })
  @ApiBadRequestResponse({ description: 'El parámetro sponsorIds debe contener UUIDs válidos.' })
  findDocumentsBySponsor(@Query() query: FindDocumentsBySponsorQueryDto) {
    return this.findInformativeDocumentsBySponsorsUseCase.execute(query.sponsorIds);
  }

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

  @Post('download-by-sponsor/bulk')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('vacationLetter'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Descargar de forma masiva los documentos de varios participantes, agrupados por sponsor',
    description:
      'Recibe hasta 100 DNIs. Genera documentos_sponsor.zip con seis carpetas: ASPIRE (un PDF combinado y ' +
      'sellado por participante), UNITED (una subcarpeta {dni} - {apellidos, nombres} por participante con PROOF, ' +
      'ULETTER, PBC, PASSPORT y JO), INTRAX (una subcarpeta {dni} - {apellidos, nombres} por participante con ' +
      'ULETTER, TRANSLATION, PASSPORT y PEF), CENET (una subcarpeta {dni} - {apellidos, nombres} por participante ' +
      'con ULETTER, PASSPORT, ENGLISH, FEE, JO y PHOTO — este último en su formato de imagen original) y AAG ' +
      '(una subcarpeta {dni} - {apellidos, nombres} por participante con ULETTER y PASSPORT) e INTEREXCHANGE ' +
      '(una subcarpeta {dni} - {apellidos, nombres} por participante con PASSPORT, ULETTER, TRANSLATION e ' +
      'INTERVIEW). El campo ' +
      '`vacationLetter` es un único PDF que se reutiliza para todos los participantes AAG del lote — si no se ' +
      'adjunta, esos DNIs se listan como omitidos. Los DNIs no encontrados, sin sponsor soportado o sin ' +
      'documentos NO detienen el proceso: se omiten y se listan en el header X-Skipped-Participants como JSON ' +
      'codificado con encodeURIComponent.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['dnis'],
      properties: {
        dnis: {
          type: 'string',
          example: '["12345678","87654321"]',
          description: 'JSON string con el array de DNIs (máx. 100).',
        },
        vacationLetter: {
          type: 'string',
          format: 'binary',
          description:
            'PDF de VacationLetter reutilizado para todos los participantes AAG del lote (opcional, máx. 10 MB).',
        },
      },
    },
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
    @UploadedFile(new ParseOptionalPdfPipe()) vacationLetter: MulterFile | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType, skipped } = await this.bulkDownloadDocumentsBySponsorUseCase.execute(
      dto.dnis,
      vacationLetter,
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Skipped-Participants', encodeURIComponent(JSON.stringify(skipped)));
    res.send(buffer);
  }

  @Post('download-by-sponsor/:userId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('vacationLetter'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Descargar los documentos del participante según su sponsor',
    description:
      'ASPIRE: combina PASSPORT, JOASPIRE, ULETTER y TRANSLATION en un solo PDF (con sello en TRANSLATION). ' +
      'UNITED: genera un .zip con una carpeta {dni} - {apellidos, nombres} conteniendo PROOF.pdf (UWTPOSS), ' +
      'ULETTER.pdf (ULETTER+TRANSLATION), PBC.pdf (PBC+PBC2), PASSPORT.pdf y JO.pdf (SPONSOR). ' +
      'INTRAX: genera un .zip con una carpeta {dni} - {apellidos, nombres} conteniendo ULETTER.pdf, ' +
      'TRANSLATION.pdf, PASSPORT.pdf y PEF.pdf. ' +
      'CENET: genera un .zip con una carpeta {dni} - {apellidos, nombres} conteniendo ULETTER.pdf ' +
      '(ULETTER+TRANSLATION), PASSPORT.pdf, ENGLISH.pdf (CENETENGLISH), FEE.pdf (CENETFEE), JO.pdf (JOCENET) ' +
      'y PHOTO (PHOTO, se entrega tal cual en su formato de imagen original, sin convertir a PDF). ' +
      'AAG: requiere adjuntar el campo `vacationLetter` (PDF) — se sube a S3 como VacationLetter.pdf sin ' +
      'persistir su referencia, y se combina en memoria dentro de ULETTER.pdf junto a ULETTER y TRANSLATION. ' +
      'Genera un .zip con una carpeta {dni} - {apellidos, nombres} conteniendo ULETTER.pdf y PASSPORT.pdf. ' +
      'INTEREXCHANGE: genera un .zip con una carpeta {dni} - {apellidos, nombres} conteniendo PASSPORT.pdf, ' +
      'ULETTER.pdf, TRANSLATION.pdf e INTERVIEW.pdf (IEXENGLISH).',
  })
  @ApiParam({ name: 'userId', description: 'UUID del participante' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        vacationLetter: {
          type: 'string',
          format: 'binary',
          description: 'PDF de VacationLetter — obligatorio solo cuando el sponsor del participante es AAG (máx. 10 MB).',
        },
      },
    },
  })
  @ApiProduces('application/pdf', 'application/zip')
  @ApiOkResponse({
    description: 'Archivo PDF (ASPIRE) o ZIP (UNITED/INTRAX/CENET/AAG/INTEREXCHANGE) con los documentos.',
  })
  @ApiNotFoundResponse({ description: 'Participante no encontrado o sin documentos subidos.' })
  @ApiBadRequestResponse({
    description:
      'El participante no pertenece a un sponsor soportado (ASPIRE, UNITED, INTRAX, CENET, AAG o ' +
      'INTEREXCHANGE), o falta el ' +
      'PDF de VacationLetter cuando el sponsor es AAG.',
  })
  async downloadBySponsor(
    @Param('userId', ParseUUIDPipe) userId: string,
    @UploadedFile(new ParseOptionalPdfPipe()) vacationLetter: MulterFile | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType } = await this.downloadDocumentsBySponsorUseCase.execute(
      userId,
      vacationLetter,
    );

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

  @Post('bulk-aceptar-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aceptar un documento de forma masiva para varios participantes',
    description:
      'Recibe un array de DNIs y aprueba (REVISADO) el documento indicado por documentId para cada uno. ' +
      'Si el documento está asociado a un sponsor, se debe enviar también sponsorId. Al finalizar, ' +
      'se reevalúa el estado general de cada participante afectado (ver TerminarRevisionUseCase). ' +
      'Los DNIs sin ese documento asignado no detienen el proceso: se listan en errors.',
  })
  @ApiOkResponse({ type: BulkReviewDocumentResponseDto })
  async bulkAceptarDocument(
    @Body() dto: BulkAceptarDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkReviewDocumentResponseDto> {
    return this.bulkAceptarDocumentUseCase.execute(dto.dnis, dto.documentId, dto.sponsorId, user.sub);
  }

  @Post('bulk-observar-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Observar un documento de forma masiva para varios participantes',
    description:
      'Recibe un array de DNIs y marca como OBSERVADO el documento indicado por documentId para cada uno, ' +
      'registrando la observación y, opcionalmente, etiquetas. Si el documento está asociado a un sponsor, ' +
      'se debe enviar también sponsorId. Al finalizar, se reevalúa el estado general de cada participante ' +
      'afectado (ver TerminarRevisionUseCase). Los DNIs sin ese documento asignado no detienen el proceso: ' +
      'se listan en errors.',
  })
  @ApiOkResponse({ type: BulkReviewDocumentResponseDto })
  async bulkObservarDocument(
    @Body() dto: BulkObservarDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkReviewDocumentResponseDto> {
    return this.bulkObservarDocumentUseCase.execute(
      dto.dnis,
      dto.documentId,
      dto.sponsorId,
      dto.observation,
      dto.etiquetaIds ?? [],
      user.sub,
    );
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

  @Post('revision-masiva-pasaporte')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revisión masiva de pasaporte — extrae datos vía IA',
    description:
      'Toma el último documento de pasaporte (en cualquier estado excepto PENDIENTE) de TODOS los ' +
      'participantes y utiliza OpenAI para extraer sus datos, con especial atención a la fecha de emisión y ' +
      'la fecha de nacimiento. Evalúa cada pasaporte: si el documento no corresponde a un pasaporte, si el ' +
      'participante no era mayor de edad al momento de la emisión (debe ser mayor a 18 años, no cumplirlos ' +
      'justo ese día), o si el Content-Type declarado por el almacenamiento no corresponde al contenido real ' +
      'del archivo (lo que suele impedir su visualización), se observa automáticamente (nuevo historial con la ' +
      'etiqueta "Observado por IA") y se reevalúa el estado del participante (ver TerminarRevisionUseCase). ' +
      'Corre en segundo plano: la respuesta HTTP no espera a que termine (puede tardar varios minutos, ya que ' +
      'analiza a todos los participantes) para evitar timeouts de proxy/gateway. Al finalizar, se notifica por ' +
      'correo al admin con un resumen y el Excel adjunto (DNI, si fue observado SI/NO, el motivo y la URL del ' +
      'documento). Los participantes cuyo documento no se pudo analizar no detienen el proceso: quedan como no ' +
      'observados con el motivo del error.',
  })
  @ApiOkResponse({ type: RevisionMasivaPasaporteResponseDto })
  @ApiConflictResponse({ description: 'Ya hay una revisión masiva de pasaportes en curso.' })
  revisionMasivaPasaporte(@CurrentUser() user: JwtPayload): RevisionMasivaPasaporteResponseDto {
    // Mismo patrón que bulkInfoParticipantsHandler: el botón del frontend no se puede bloquear de
    // forma confiable (varias personas pueden dispararlo a la vez) — se corta acá antes de arrancar
    // otro batch completo en paralelo, que terminaría pisando las mismas filas que la corrida ya en
    // curso. Se lanza como excepción (409) para que el AllExceptionsFilter arme
    // { success: false, ... } y el frontend pueda distinguirlo de una respuesta exitosa normal.
    if (this.bulkExtractPassportDataUseCase.isSyncInProgress()) {
      throw new ConflictException(
        'Ya hay una revisión masiva de pasaportes en curso. Espera a que termine antes de iniciar otra.',
      );
    }

    // No se espera esta promesa a propósito (fire-and-forget) — un batch completo puede tardar
    // varios minutos y cualquier proxy delante del server cortaría la conexión mucho antes de que
    // termine. El propio use case ya loguea el resultado y notifica al admin por correo al acabar.
    this.bulkExtractPassportDataUseCase.execute(user.sub).catch(() => {
      // Ya logueado y notificado dentro del use case — este catch solo evita una unhandled rejection.
    });
    return {
      message:
        'Revisión masiva de pasaportes iniciada en segundo plano. El resultado (Excel) se enviará por correo al finalizar.',
    };
  }
}
