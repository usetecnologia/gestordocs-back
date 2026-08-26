import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RoleCode, STAFF_ROLES } from '@common/enums/role-code.enum';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { ParseStampImagePipe } from './pipes/parse-stamp-image.pipe';
import type { MulterFile } from '@modules/user-documents/domain/multer-file.interface';
import {
  CreateSponsorPackageUseCase,
  DeleteSponsorPackageUseCase,
  DuplicateSponsorPackageUseCase,
  FindAllSponsorPackagesUseCase,
  FindOneSponsorPackageUseCase,
  UpdateSponsorPackageOutputsOrderUseCase,
  UpdateSponsorPackageUseCase,
} from '../../application/use-cases/crud-sponsor-package.use-cases';
import { PreviewSponsorPackageUseCase } from '../../application/use-cases/preview-sponsor-package.use-case';
import { FindRequiredInputsUseCase } from '../../application/use-cases/find-required-inputs.use-case';
import {
  CreateSponsorPackageDto,
  DuplicateSponsorPackageDto,
  FindRequiredInputsQueryDto,
  FindSponsorPackagesQueryDto,
  PreviewSponsorPackageDto,
  UpdateOutputsOrderDto,
  UpdateSponsorPackageDto,
} from './dtos/sponsor-package.dto';
import {
  DownloadRequirementsDto,
  PreviewResponseDto,
  SponsorPackageDto,
  SponsorPackageListItemDto,
  StampAssetResponseDto,
} from './dtos/sponsor-package-response.dto';
import {
  CreateSponsorPackageData,
  UpdateSponsorPackageData,
} from '../../domain/sponsor-package.repository';

const STAMP_S3_FOLDER = 'sponsor-package-stamps';

/**
 * Administración de los paquetes de descarga por sponsor.
 *
 * **Solo ADMIN.** La descarga en sí no cambia de permisos: sigue con `STAFF_ROLES` en
 * `UserDocumentsController`, así supervisores y asesores mantienen la acción masiva que ya usan.
 * Acá se configura lo que esa descarga produce, que es otra cosa.
 */
@ApiTags('sponsor-packages')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@ApiForbiddenResponse({ description: 'El rol del usuario no tiene permiso para esta acción.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
@Controller({ path: 'sponsor-packages', version: '1' })
export class SponsorPackageController {
  constructor(
    private readonly findAll: FindAllSponsorPackagesUseCase,
    private readonly findOne: FindOneSponsorPackageUseCase,
    private readonly createPackage: CreateSponsorPackageUseCase,
    private readonly updatePackage: UpdateSponsorPackageUseCase,
    private readonly deletePackage: DeleteSponsorPackageUseCase,
    private readonly duplicatePackage: DuplicateSponsorPackageUseCase,
    private readonly updateOutputsOrder: UpdateSponsorPackageOutputsOrderUseCase,
    private readonly preview: PreviewSponsorPackageUseCase,
    private readonly findRequiredInputs: FindRequiredInputsUseCase,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar paquetes de descarga (paginado)',
    description:
      'Un paquete describe cómo se arma el ZIP de un sponsor: qué archivos salen, qué documentos ' +
      'entran a cada uno y en qué orden.',
  })
  @ApiOkResponse({ type: PaginationResultDto })
  async list(
    @Query() query: FindSponsorPackagesQueryDto,
  ): Promise<PaginationResultDto<SponsorPackageListItemDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.findAll.execute({ ...query, page, limit });
    return toPaginationResult(result.data as SponsorPackageListItemDto[], result.total, page, limit);
  }

  /**
   * Único endpoint del módulo abierto a todo el staff: lo consume la pantalla de descarga, que usan
   * supervisores y asesores además de admin. Devuelve solo metadatos del adjunto —cómo se llama el
   * campo, qué mostrar y qué acepta—, nunca la configuración del paquete.
   *
   * Va declarado ANTES de `@Get(':id')`: si fuera después, Nest tomaría "required-inputs" como un id
   * y respondería un 400 de UUID inválido.
   */
  @Roles(...STAFF_ROLES)
  @Get('required-inputs')
  @ApiOperation({
    summary: 'Qué sponsors tienen descarga y qué archivos hay que adjuntar',
    description:
      'Permite que la pantalla de descarga arme el diálogo con lo que la configuración pide, en vez ' +
      'de asumir que el único adjunto es el VacationLetter de AAG.',
  })
  @ApiQuery({ name: 'sponsorCodes', example: 'AAG,UNITED', required: true })
  @ApiOkResponse({ type: DownloadRequirementsDto })
  requiredInputs(@Query() query: FindRequiredInputsQueryDto): Promise<DownloadRequirementsDto> {
    return this.findRequiredInputs.execute(query.sponsorCodes);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un paquete con su árbol completo' })
  @ApiParam({ name: 'id', description: 'UUID del paquete' })
  @ApiOkResponse({ type: SponsorPackageDto })
  @ApiNotFoundResponse({ description: 'Paquete no encontrado.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SponsorPackageDto> {
    return this.findOne.execute(id) as unknown as Promise<SponsorPackageDto>;
  }

  @Post()
  @ApiOperation({ summary: 'Crear paquete de descarga' })
  @ApiCreatedResponse({ type: SponsorPackageDto })
  @ApiBadRequestResponse({ description: 'Configuración inválida (plantillas, fuentes o referencias).' })
  @ApiConflictResponse({ description: 'Ya existe un paquete activo con ese alcance.' })
  async create(
    @Body() dto: CreateSponsorPackageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SponsorPackageDto> {
    const creado = await this.createPackage.execute(this.toCreateData(dto, user.sub));
    return creado as unknown as SponsorPackageDto;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar paquete',
    description:
      'Reemplaza el árbol completo: los archivos, fuentes, sellos y adjuntos que se envíen pasan a ' +
      'ser los únicos. Lo que no venga en el payload se borra.',
  })
  @ApiParam({ name: 'id', description: 'UUID del paquete' })
  @ApiOkResponse({ type: SponsorPackageDto })
  @ApiNotFoundResponse({ description: 'Paquete no encontrado.' })
  @ApiBadRequestResponse({ description: 'Configuración inválida.' })
  @ApiConflictResponse({ description: 'Ya existe otro paquete activo con ese alcance.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSponsorPackageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SponsorPackageDto> {
    const data: UpdateSponsorPackageData = {
      ...this.toCreateData(dto, user.sub),
      status: dto.status ?? true,
      updatedById: user.sub,
    };
    const actualizado = await this.updatePackage.execute(id, data);
    return actualizado as unknown as SponsorPackageDto;
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Desactivar paquete',
    description: 'Borrado lógico. El paquete deja de resolverse, pero su configuración queda.',
  })
  @ApiParam({ name: 'id', description: 'UUID del paquete' })
  @ApiOkResponse({ schema: { example: { message: 'Paquete desactivado correctamente.' } } })
  @ApiNotFoundResponse({ description: 'Paquete no encontrado.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    await this.deletePackage.execute(id, user.sub);
    return { message: 'Paquete desactivado correctamente.' };
  }

  @Post(':id/duplicate')
  @ApiOperation({
    summary: 'Duplicar paquete',
    description:
      'Clona el árbol completo. La copia nace DESACTIVADA: si naciera activa chocaría de inmediato ' +
      'con el original por unicidad de alcance.',
  })
  @ApiParam({ name: 'id', description: 'UUID del paquete a clonar' })
  @ApiCreatedResponse({ type: SponsorPackageDto })
  @ApiNotFoundResponse({ description: 'Paquete no encontrado.' })
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DuplicateSponsorPackageDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SponsorPackageDto> {
    const copia = await this.duplicatePackage.execute(id, dto.name, user.sub);
    return copia as unknown as SponsorPackageDto;
  }

  @Patch(':id/outputs/order')
  @ApiOperation({ summary: 'Reordenar los archivos de un paquete' })
  @ApiParam({ name: 'id', description: 'UUID del paquete' })
  @ApiOkResponse({ schema: { example: { message: 'Orden actualizado correctamente.' } } })
  @ApiNotFoundResponse({ description: 'Paquete no encontrado, o algún archivo no le pertenece.' })
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutputsOrderDto,
  ): Promise<{ message: string }> {
    await this.updateOutputsOrder.execute(id, dto.orders);
    return { message: 'Orden actualizado correctamente.' };
  }

  @Post('stamp-asset')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir la imagen de un sello',
    description: 'Devuelve la URL en S3 para usar en `assetUrl`. PNG, máximo 5 MB.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'PNG del sello (máx. 5 MB)' } },
    },
  })
  @ApiCreatedResponse({ type: StampAssetResponseDto })
  @ApiBadRequestResponse({ description: 'El archivo debe ser un PNG de hasta 5 MB.' })
  async uploadStamp(
    @UploadedFile(new ParseStampImagePipe()) file: MulterFile,
  ): Promise<StampAssetResponseDto> {
    const { url } = await this.awsS3Service.uploadOne(file, STAMP_S3_FOLDER);
    return { url };
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Probar un paquete con un DNI',
    description:
      'Devuelve el árbol de archivos que la descarga produciría, con los faltantes y su motivo, ' +
      'SIN generar el ZIP ni bajar nada de S3. Usa el mismo planificador que el motor de armado, ' +
      'así que lo que muestra es lo que realmente saldría.',
  })
  @ApiOkResponse({ type: PreviewResponseDto })
  @ApiNotFoundResponse({ description: 'DNI o paquete no encontrado.' })
  previewPackage(@Body() dto: PreviewSponsorPackageDto): Promise<PreviewResponseDto> {
    return this.preview.execute(dto.dni, dto.packageId);
  }

  /** Traduce el DTO al contrato del dominio, aplicando los valores por defecto. */
  private toCreateData(dto: CreateSponsorPackageDto, userId: string): CreateSponsorPackageData {
    return {
      name: dto.name,
      sponsorId: dto.sponsorId,
      programId: dto.programId ?? null,
      countryId: dto.countryId ?? null,
      structure: dto.structure,
      folderPathTemplate: dto.folderPathTemplate,
      itemNameTemplate: dto.itemNameTemplate,
      fallbackPrograma: dto.fallbackPrograma ?? 'SIN PROGRAMA',
      fallbackPais: dto.fallbackPais ?? 'SIN PAIS',
      priority: dto.priority ?? 0,
      outputs: dto.outputs.map((output) => ({
        filename: output.filename,
        mode: output.mode,
        order: output.order,
        emitWhenEmpty: output.emitWhenEmpty,
        sources: output.sources.map((source) => ({
          documentId: source.documentId ?? null,
          inputSlug: source.inputSlug ?? null,
          order: source.order,
          onMissing: source.onMissing,
        })),
        stamps: output.stamps.map((stamp) => ({
          assetUrl: stamp.assetUrl,
          onlyDocumentId: stamp.onlyDocumentId ?? null,
          widthPt: stamp.widthPt,
          marginXPt: stamp.marginXPt,
          marginYPt: stamp.marginYPt,
          anchor: stamp.anchor,
        })),
      })),
      inputs: dto.inputs.map((input) => ({
        slug: input.slug,
        label: input.label,
        required: input.required,
        mimeType: input.mimeType,
        maxSizeMb: input.maxSizeMb,
        archiveToS3: input.archiveToS3,
        s3Folder: input.s3Folder ?? null,
        archiveFilename: input.archiveFilename ?? null,
      })),
      createdById: userId,
    };
  }
}
