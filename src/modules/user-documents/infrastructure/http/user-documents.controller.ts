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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { MulterFile } from '../../domain/multer-file.interface';
import { UploadFileDocumentUseCase } from '../../application/use-cases/upload-file-document.use-case';
import { FindUserDocumentsUseCase } from '../../application/use-cases/find-user-documents.use-case';
import { AceptarDocumentUseCase } from '../../application/use-cases/aceptar-document.use-case';
import { ObservarDocumentUseCase } from '../../application/use-cases/observar-document.use-case';
import { UploadFileDocumentDto } from './dtos/upload-file-document.dto';
import { UserDocumentWithHistoryDto } from './dtos/find-user-documents-response.dto';
import { AceptarDocumentDto, ObservarDocumentDto } from './dtos/review-document.dto';
import { FindUserDocumentsQueryDto } from './dtos/find-user-documents-query.dto';
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

  @Post('aceptar-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceptar un documento — cambia estado a REVISADO' })
  @ApiOkResponse({ description: 'Documento aceptado correctamente.' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  aceptarDocument(
    @Body() dto: AceptarDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.aceptarDocumentUseCase.execute(dto.userDocumentId, user.sub);
  }

  @Post('observar-document')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Observar un documento — cambia estado a OBSERVADO y registra observación con etiquetas' })
  @ApiOkResponse({ description: 'Documento observado correctamente.' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  observarDocument(
    @Body() dto: ObservarDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.observarDocumentUseCase.execute(dto, user.sub);
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
  uploadFileDocument(
    @UploadedFile(new MaxFileSizePipe()) file: MulterFile,
    @Body() dto: UploadFileDocumentDto,
  ): Promise<void> {
    return this.uploadFileDocumentUseCase.execute(file, dto);
  }
}
