import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAuthRepository, AUTH_REPOSITORY } from '../../domain/auth.repository';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { RefreshTokenDto } from '../../infrastructure/http/dtos/refresh-token.dto';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async execute(dto: RefreshTokenDto): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtTokenService.verifyRefresh(dto.refreshToken);

    const credentials = await this.authRepository.findById(payload.sub);
    if (!credentials) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    const role = credentials.role.code ?? credentials.role.name;

    const accessToken = this.jwtTokenService.sign({
      sub: credentials.id,
      email: credentials.email ?? '',
      username: credentials.username ?? '',
      role,
    });
    const refreshToken = this.jwtTokenService.signRefresh(credentials.id, randomUUID());

    return { accessToken, refreshToken };
  }
}
