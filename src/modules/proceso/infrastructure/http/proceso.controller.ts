import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { STAFF_ROLES } from '@common/enums/role-code.enum';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { FinalizarProcesoUseCase } from '../../application/use-cases/finalizar-proceso.use-case';
import { ContinuarProcesoUseCase } from '../../application/use-cases/continuar-proceso.use-case';
import { ContinuarProcesoDto, FinalizarProcesoDto } from './dtos/finalizar-proceso.dto';
import { FinalizarProcesoResponseDto } from './dtos/finalizar-proceso-response.dto';
import { FindHistorialProcesosUseCase } from '../../application/use-cases/find-historial-procesos.use-case';
import { ProcesoHistorialItemDto } from './dtos/proceso-historial-response.dto';

/**
 * Acciones de USE sobre el proceso. Las dos son exclusivas del personal interno: el participante no
 * puede finalizar el suyo ni reabrirlo, y de eso depende que no pueda abrir procesos en cadena.
 *
 * `RolesGuard` deniega por defecto — un endpoint que se agregue acá sin `@Roles` responde 403.
 */
@ApiTags('procesos')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@ApiForbiddenResponse({ description: 'El rol del usuario no tiene permiso para esta acción.' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'procesos', version: '1' })
export class ProcesoController {
  constructor(
    private readonly finalizarProcesoUseCase: FinalizarProcesoUseCase,
    private readonly continuarProcesoUseCase: ContinuarProcesoUseCase,
    private readonly findHistorialProcesosUseCase: FindHistorialProcesosUseCase,
  ) {}

  @Roles(...STAFF_ROLES)
  @Get('participante/:participanteId/historial')
  @ApiOperation({
    summary: 'Historial de procesos de un participante',
    description:
      'Todos los ciclos que tuvo, del más reciente al más antiguo, con su estado, sus fechas, quién ' +
      'lo finalizó y cuántos documentos tenía. Es información de USE: el participante nunca ve sus ' +
      'procesos anteriores.',
  })
  @ApiOkResponse({ type: [ProcesoHistorialItemDto] })
  historial(
    @Param('participanteId', ParseUUIDPipe) participanteId: string,
  ): Promise<ProcesoHistorialItemDto[]> {
    return this.findHistorialProcesosUseCase.execute(participanteId);
  }

  @Roles(...STAFF_ROLES)
  @Post('finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalizar el proceso de uno o varios participantes',
    description:
      'Cierra el proceso abierto de cada DNI recibido: pasa a FINALIZADO y deja de ser el activo. ' +
      'Los documentos no se tocan — el expediente queda como registro histórico de ese ciclo. ' +
      'Un DNI que falla no detiene a los demás: se lista en errors.',
  })
  @ApiOkResponse({ type: FinalizarProcesoResponseDto })
  finalizar(
    @Body() dto: FinalizarProcesoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FinalizarProcesoResponseDto> {
    return this.finalizarProcesoUseCase.execute(dto.dnis, user.sub);
  }

  @Roles(...STAFF_ROLES)
  @Post('continuar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Continuar el proceso de un participante',
    description:
      'Reabre el último proceso finalizado del participante — el mismo registro, con todo su ' +
      'avance intacto. Es el "deshacer" de una finalización por error, no un ciclo nuevo.',
  })
  @ApiOkResponse({ schema: { example: { message: 'Proceso reabierto correctamente.' } } })
  @ApiNotFoundResponse({ description: 'El participante no existe o no tiene procesos finalizados.' })
  @ApiConflictResponse({ description: 'El participante ya tiene un proceso abierto.' })
  async continuar(@Body() dto: ContinuarProcesoDto) {
    await this.continuarProcesoUseCase.execute(dto.dni);
    return { message: 'Proceso reabierto correctamente.' };
  }
}
