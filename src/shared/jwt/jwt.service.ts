import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { envs } from '@config/envs';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { RefreshTokenPayload } from './interfaces/refresh-token-payload.interface';

@Injectable()
export class JwtTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  verify(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  signRefresh(userId: string, jti: string): string {
    return this.jwtService.sign(
      { sub: userId, jti },
      {
        secret: envs.JWT_REFRESH_SECRET,
        expiresIn: envs.JWT_REFRESH_EXPIRES_IN as StringValue,
      },
    );
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: envs.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado.');
    }
  }
}
