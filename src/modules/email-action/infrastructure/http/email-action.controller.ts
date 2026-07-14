import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { FindActiveEmailActionUseCase } from '../../application/use-cases/find-active-email-action.use-case';
import { EmailActionResponseDto } from './dtos/email-action-response.dto';

@ApiTags('acciones-correo')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente.' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'acciones-correo', version: '1' })
export class EmailActionController {
  constructor(private readonly findActiveEmailAction: FindActiveEmailActionUseCase) {}

  @Get('active')
  @ApiOperation({ summary: 'Listar acciones de correo activas (catálogo, sin paginación)' })
  @ApiOkResponse({ type: EmailActionResponseDto, isArray: true })
  findActive() {
    return this.findActiveEmailAction.execute();
  }
}
