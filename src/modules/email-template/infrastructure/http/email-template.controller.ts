import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  ParseUUIDPipe,
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
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ParseImagePipe } from '@common/pipes/parse-image.pipe';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { CreateEmailTemplateUseCase } from '../../application/use-cases/create-email-template.use-case';
import { FindAllEmailTemplateUseCase } from '../../application/use-cases/find-all-email-template.use-case';
import { FindOneEmailTemplateUseCase } from '../../application/use-cases/find-one-email-template.use-case';
import { UpdateEmailTemplateUseCase } from '../../application/use-cases/update-email-template.use-case';
import { DeleteEmailTemplateUseCase } from '../../application/use-cases/delete-email-template.use-case';
import { UploadImagenEmailTemplateUseCase } from '../../application/use-cases/upload-imagen-email-template.use-case';
import { FindTemplateVariablesUseCase } from '../../application/use-cases/find-template-variables.use-case';
import { CreateEmailTemplateDto } from './dtos/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dtos/update-email-template.dto';
import { EmailTemplateResponseDto } from './dtos/email-template-response.dto';
import { FindEmailTemplatesQueryDto } from './dtos/find-email-templates-query.dto';
import { TemplateVariableResponseDto } from './dtos/template-variable-response.dto';
import type { MulterFile } from '../../domain/multer-file.interface';

@ApiTags('plantillas-correo')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'plantillas-correo', version: '1' })
export class EmailTemplateController {
  constructor(
    private readonly createEmailTemplate: CreateEmailTemplateUseCase,
    private readonly findAllEmailTemplate: FindAllEmailTemplateUseCase,
    private readonly findOneEmailTemplate: FindOneEmailTemplateUseCase,
    private readonly updateEmailTemplate: UpdateEmailTemplateUseCase,
    private readonly deleteEmailTemplate: DeleteEmailTemplateUseCase,
    private readonly uploadImagenEmailTemplate: UploadImagenEmailTemplateUseCase,
    private readonly findTemplateVariables: FindTemplateVariablesUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear plantilla de correo' })
  @ApiCreatedResponse({ type: EmailTemplateResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiConflictResponse({ description: 'Código en uso o ya existe una plantilla activa para la acción.' })
  create(@Body() dto: CreateEmailTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.createEmailTemplate.execute(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Listar plantillas de correo (paginado)' })
  @ApiOkResponse({ type: PaginationResultDto })
  async findAll(
    @Query() query: FindEmailTemplatesQueryDto,
  ): Promise<PaginationResultDto<EmailTemplateResponseDto>> {
    const result = await this.findAllEmailTemplate.execute(query);
    return toPaginationResult(
      result.data as unknown as EmailTemplateResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('variables')
  @ApiOperation({
    summary: 'Listar variables disponibles para subject/htmlContent',
    description:
      'Catálogo cerrado de variables que el frontend debe ofrecer para seleccionar/insertar ' +
      '(no escribir a mano) al componer subject/htmlContent — evita variantes como {{name}}, ' +
      '{{nombre}} o {{fullname}} que el backend no podría reconocer al sustituir.',
  })
  @ApiOkResponse({ type: TemplateVariableResponseDto, isArray: true })
  findVariables() {
    return this.findTemplateVariables.execute();
  }

  @Post('upload-imagen')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imagen para el cuerpo de una plantilla de correo' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Imagen (jpeg, png, webp, gif, avif — máx. 10 MB)',
        },
      },
    },
  })
  @ApiOkResponse({ schema: { example: { url: 'https://.../imagen.png' } } })
  @ApiBadRequestResponse({ description: 'Archivo inválido o ausente.' })
  uploadImagen(@UploadedFile(new ParseImagePipe()) file: MulterFile) {
    return this.uploadImagenEmailTemplate.execute(file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener plantilla de correo por ID' })
  @ApiParam({ name: 'id', description: 'UUID de la plantilla' })
  @ApiOkResponse({ type: EmailTemplateResponseDto })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.findOneEmailTemplate.execute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar plantilla de correo' })
  @ApiParam({ name: 'id', description: 'UUID de la plantilla' })
  @ApiOkResponse({ type: EmailTemplateResponseDto })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada.' })
  @ApiConflictResponse({ description: 'Código en uso o ya existe una plantilla activa para la acción.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.updateEmailTemplate.execute(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar plantilla de correo' })
  @ApiParam({ name: 'id', description: 'UUID de la plantilla' })
  @ApiOkResponse({ schema: { example: { success: true, data: null } } })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.deleteEmailTemplate.execute(id);
    return null;
  }
}
