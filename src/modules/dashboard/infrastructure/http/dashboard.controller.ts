import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { LinkDataUseCase } from '../../application/use-cases/link-data.use-case';
import { SyncDataResponseDto } from './dtos/link-data-response.dto';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
@UseGuards(JwtAuthGuard)
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly linkDataUseCase: LinkDataUseCase) {}

  @Get('link-data')
  @ApiOperation({ summary: 'Sync countries, programs and sponsors from Workuse API' })
  @ApiOkResponse({ type: SyncDataResponseDto })
  @ApiInternalServerErrorResponse({ description: 'Workuse API unreachable or returned an error' })
  linkData(): Promise<SyncDataResponseDto> {
    return this.linkDataUseCase.execute();
  }
}
