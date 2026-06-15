import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { MulterFile } from '../../domain/multer-file.interface';
import { UploadFileDocumentUseCase } from '../../application/use-cases/upload-file-document.use-case';
import { FindUserDocumentsUseCase } from '../../application/use-cases/find-user-documents.use-case';
import { UploadFileDocumentDto } from './dtos/upload-file-document.dto';
import { UserDocumentWithHistoryDto } from './dtos/find-user-documents-response.dto';
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
  ) {}

  @Get('by-user/:userId')
  @ApiOperation({ summary: 'Get all documents with history for a user' })
  @ApiParam({ name: 'userId', description: 'UUID del usuario' })
  @ApiOkResponse({ type: [UserDocumentWithHistoryDto] })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado.' })
  findByUser(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserDocumentWithHistoryDto[]> {
    return this.findUserDocumentsUseCase.execute(userId);
  }

  @Post('upload-file-document')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file for a user document — creates a new SUBIDO history entry' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'userDocumentId'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Archivo (máx. 10 MB)' },
        userDocumentId: { type: 'string', format: 'uuid', example: 'uuid-del-user-document' },
      },
    },
  })
  @ApiOkResponse({ description: 'File uploaded and history created successfully' })
  @ApiNotFoundResponse({ description: 'UserDocument no encontrado.' })
  uploadFileDocument(
    @UploadedFile(new MaxFileSizePipe()) file: MulterFile,
    @Body() dto: UploadFileDocumentDto,
  ): Promise<void> {
    return this.uploadFileDocumentUseCase.execute(file, dto);
  }
}
