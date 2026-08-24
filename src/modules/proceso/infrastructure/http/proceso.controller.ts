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
import { RoleCode, STAFF_ROLES } from '@common/enums/role-code.enum';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import type { JwtPayload } from '@shared/jwt/interfaces/jwt-payload.interface';
import { FinalizarProcesoUseCase } from '../../application/use-cases/finalizar-proceso.use-case';
import { ContinuarProcesoUseCase } from '../../application/use-cases/continuar-proceso.use-case';
import { CrearNuevoProcesoUseCase } from '../../application/use-cases/crear-nuevo-proceso.use-case';
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
    private readonly crearNuevoProcesoUseCase: CrearNuevoProcesoUseCase,
  ) {}

  /**
   * El participante abre su propio ciclo siguiente. Es lo que hace el botón que ve al entrar cuando
   * su proceso está finalizado.
   *
   * No recibe a quién: el participante sale del JWT. Así no hay forma de abrirle un proceso a otro,
   * que es lo que pasaría con un id en la ruta o en el cuerpo.
   */
  @Roles(RoleCode.PARTICIPANTE)
  @Post('mio/nuevo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Abrir el proceso siguiente (el propio participante)',
    description:
      'Crea el ciclo nuevo del participante autenticado y le arma el expediente con todos sus ' +
      'documentos en PENDIENTE. No es automático: lo dispara el participante desde el aviso de ' +
      '"proceso finalizado".',
  })
  @ApiOkResponse({ schema: { example: { message: 'Proceso nuevo abierto correctamente.' } } })
  @ApiConflictResponse({ description: 'Ya tiene un proceso en curso, o le faltan datos.' })
  @ApiNotFoundResponse({ description: 'No se encontró el participante.' })
  async crearMiProcesoNuevo(@CurrentUser() user: JwtPayload) {
    await this.crearNuevoProcesoUseCase.execute(user.sub);
    return { message: 'Proceso nuevo abierto correctamente.' };
  }

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
      'Cierra los ciclos indicados por su id: pasan a FINALIZADO y dejan de ser el activo. Se ' +
      'identifican por proceso y no por participante, así se cierra exactamente el ciclo que la ' +
      'pantalla muestra. Los documentos no se tocan — el expediente queda como registro histórico. ' +
      'Un ciclo que falla no detiene a los demás: se lista en errors.',
  })
  @ApiOkResponse({ type: FinalizarProcesoResponseDto })
  finalizar(
    @Body() dto: FinalizarProcesoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<FinalizarProcesoResponseDto> {
    return this.finalizarProcesoUseCase.execute(dto.procesoIds, user.sub);
  }

  @Roles(...STAFF_ROLES)
  @Post('continuar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Continuar el proceso de un participante',
    description:
      'Reabre el ciclo indicado — el mismo registro, con todo su avance intacto. Es el "deshacer" ' +
      'de una finalización por error, no un ciclo nuevo.',
  })
  @ApiOkResponse({ schema: { example: { message: 'Proceso reabierto correctamente.' } } })
  @ApiNotFoundResponse({ description: 'El proceso no existe.' })
  @ApiConflictResponse({
    description: 'Ese ciclo no está finalizado, o el participante ya tiene otro abierto.',
  })
  async continuar(@Body() dto: ContinuarProcesoDto) {
    await this.continuarProcesoUseCase.execute(dto.procesoId);
    return { message: 'Proceso reabierto correctamente.' };
  }
}
