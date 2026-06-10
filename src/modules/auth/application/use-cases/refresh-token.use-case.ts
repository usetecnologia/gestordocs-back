import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAuthTokenStore, AUTH_TOKEN_STORE } from '../../domain/auth-token-store.port';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { RefreshTokenDto } from '../../infrastructure/http/dtos/refresh-token.dto';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(AUTH_TOKEN_STORE) private readonly tokenStore: IAuthTokenStore,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtTokenService.verifyRefresh(dto.refreshToken);

    const userId = await this.tokenStore.getUserId(payload.jti);
    if (!userId) {
      throw new UnauthorizedException('Sesión expirada o inválida.');
    }

    await this.tokenStore.revoke(payload.jti);

    const newJti = randomUUID();
    const accessToken = this.jwtTokenService.sign({
      sub: userId,
      email: '',
      username: '',
      role: '',
    });
    const refreshToken = this.jwtTokenService.signRefresh(userId, newJti);

    await this.tokenStore.save(newJti, userId);

    return { accessToken, refreshToken };
  }
}
