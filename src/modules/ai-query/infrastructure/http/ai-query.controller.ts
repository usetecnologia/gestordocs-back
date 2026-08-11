import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { AdminRoleGuard } from '@common/guards/admin-role.guard';
import { RunNlQueryUseCase } from '../../application/use-cases/run-nl-query.use-case';
import { RunNlQueryDto } from './dtos/run-nl-query.dto';
import { NlQueryResponseDto } from './dtos/nl-query-response.dto';

@ApiTags('consultas')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@ApiForbiddenResponse({ description: 'Solo disponible para administradores' })
@UseGuards(JwtAuthGuard, AdminRoleGuard)
@Controller({ path: 'consultas', version: '1' })
export class AiQueryController {
  constructor(private readonly runNlQuery: RunNlQueryUseCase) {}

  // Es un POST porque la pregunta viaja en el cuerpo, pero la operación es de lectura pura:
  // devuelve el conjunto de resultados, no un mensaje de confirmación.
  @Post()
  @ApiOperation({
    summary: 'Ejecuta una consulta en lenguaje natural (solo lectura)',
    description:
      'Traduce la pregunta a una sentencia SELECT, la valida contra una lista blanca de tablas y la ejecuta. ' +
      'Cualquier sentencia que no sea de lectura se rechaza antes de llegar a la base de datos.',
  })
  @ApiOkResponse({ type: NlQueryResponseDto })
  @ApiBadRequestResponse({
    description:
      'La pregunta no se pudo traducir, pide modificar datos o la consulta generada no es segura.',
  })
  run(@Body() dto: RunNlQueryDto): Promise<NlQueryResponseDto> {
    return this.runNlQuery.execute(dto.question);
  }
}
