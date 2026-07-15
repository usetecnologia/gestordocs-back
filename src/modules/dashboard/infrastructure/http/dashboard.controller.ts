import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PaginationResultDto, toPaginationResult } from '@common/dtos/pagination-result.dto';
import { UserResponseDto } from '@modules/user/infrastructure/http/dtos/user-response.dto';
import { LinkDataUseCase } from '../../application/use-cases/link-data.use-case';
import { GetStatusFunnelUseCase } from '../../application/use-cases/get-status-funnel.use-case';
import { FindParticipantsByStatusUseCase } from '../../application/use-cases/find-participants-by-status.use-case';
import { ExportFunnelParticipantsUseCase } from '../../application/use-cases/export-funnel-participants.use-case';
import { SyncDataResponseDto } from './dtos/link-data-response.dto';
import { DashboardFunnelQueryDto } from './dtos/dashboard-funnel-query.dto';
import { DashboardParticipantsQueryDto } from './dtos/dashboard-participants-query.dto';
import { DashboardFunnelExportQueryDto } from './dtos/dashboard-funnel-export-query.dto';
import { StatusFunnelItemDto } from './dtos/status-funnel-item.dto';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(
    private readonly linkDataUseCase: LinkDataUseCase,
    private readonly getStatusFunnel: GetStatusFunnelUseCase,
    private readonly findParticipantsByStatus: FindParticipantsByStatusUseCase,
    private readonly exportFunnelParticipants: ExportFunnelParticipantsUseCase,
  ) {}

  @Get('link-data')
  @ApiOperation({ summary: 'Sync countries, programs and sponsors from Workuse API' })
  @ApiOkResponse({ type: SyncDataResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Workuse API unreachable or returned an error' })
  linkData(): Promise<SyncDataResponseDto> {
    return this.linkDataUseCase.execute();
  }

  @Get('status-funnel')
  @ApiOperation({
    summary: 'Reporte funnel — cantidad de participantes por estado (excluye ACTIVO y RETIRADO)',
  })
  @ApiOkResponse({ type: [StatusFunnelItemDto] })
  getFunnel(@Query() query: DashboardFunnelQueryDto): Promise<StatusFunnelItemDto[]> {
    return this.getStatusFunnel.execute(query);
  }

  @Get('status-funnel/participants')
  @ApiOperation({
    summary: 'Listado paginado de participantes en el estado del funnel seleccionado',
  })
  @ApiOkResponse({ type: PaginationResultDto })
  async getFunnelParticipants(
    @Query() query: DashboardParticipantsQueryDto,
  ): Promise<PaginationResultDto<UserResponseDto>> {
    const result = await this.findParticipantsByStatus.execute(query);
    return toPaginationResult(
      result.data as UserResponseDto[],
      result.total,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('status-funnel/export')
  @ApiOperation({
    summary: 'Exportar a Excel los participantes del estado del funnel seleccionado — sin paginación',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'Archivo Excel (.xlsx) con los participantes del estado seleccionado.' })
  async exportFunnel(
    @Query() query: DashboardFunnelExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.exportFunnelParticipants.execute(query);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="funnel-participants.xlsx"');
    res.send(buffer);
  }
}
