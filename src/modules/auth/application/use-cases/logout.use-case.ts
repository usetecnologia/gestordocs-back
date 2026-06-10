import { Inject, Injectable } from '@nestjs/common';
import { IAuthTokenStore, AUTH_TOKEN_STORE } from '../../domain/auth-token-store.port';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { RefreshTokenDto } from '../../infrastructure/http/dtos/refresh-token.dto';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(AUTH_TOKEN_STORE) private readonly tokenStore: IAuthTokenStore,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<void> {
    try {
      const payload = this.jwtTokenService.verifyRefresh(dto.refreshToken);
      await this.tokenStore.revoke(payload.jti);
    } catch {
      // Token inválido o ya expirado — se considera sesión cerrada
    }
  }
}
