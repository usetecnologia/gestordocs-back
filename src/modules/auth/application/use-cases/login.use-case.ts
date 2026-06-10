import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAuthRepository, AUTH_REPOSITORY } from '../../domain/auth.repository';
import { IPasswordVerifier, PASSWORD_VERIFIER } from '../../domain/password-verifier.port';
import { IAuthTokenStore, AUTH_TOKEN_STORE } from '../../domain/auth-token-store.port';
import { LoginResult } from '../../domain/login-result.entity';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { LoginDto } from '../../infrastructure/http/dtos/login.dto';
import { envs } from '@config/envs';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    @Inject(PASSWORD_VERIFIER) private readonly passwordVerifier: IPasswordVerifier,
    @Inject(AUTH_TOKEN_STORE) private readonly tokenStore: IAuthTokenStore,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResult> {
    const isEmail = dto.identifier.includes('@');
    const credentials = isEmail
      ? await this.authRepository.findByEmail(dto.identifier)
      : await this.authRepository.findByUsername(dto.identifier);

    if (!credentials || !credentials.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordMatch = await this.passwordVerifier.compare(
      dto.password,
      credentials.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    if (credentials.status !== 'ACTIVO') {
      throw new UnauthorizedException('Cuenta inactiva o suspendida.');
    }

    const jti = randomUUID();
    const role = credentials.role.code ?? credentials.role.name;

    const accessToken = this.jwtTokenService.sign({
      sub: credentials.id,
      email: credentials.email ?? '',
      username: credentials.username ?? '',
      role,
    });

    const refreshToken = this.jwtTokenService.signRefresh(credentials.id, jti);

    await this.tokenStore.save(jti, credentials.id);

    return new LoginResult(accessToken, refreshToken, {
      id: credentials.id,
      username: credentials.username,
      email: credentials.email,
      role: credentials.role,
      status: credentials.status,
    });
  }
}
