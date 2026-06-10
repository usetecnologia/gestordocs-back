import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { LoginResponseDto, TokensResponseDto } from './dtos/auth-response.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas o cuenta inactiva.' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.loginUseCase.execute(dto) as Promise<LoginResponseDto>;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar tokens de sesión' })
  @ApiOkResponse({ type: TokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido o expirado.' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokensResponseDto> {
    return this.refreshTokenUseCase.execute(dto) as Promise<TokensResponseDto>;
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiNoContentResponse({ description: 'Sesión cerrada.' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.logoutUseCase.execute(dto);
  }
}
