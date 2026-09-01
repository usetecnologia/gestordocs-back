import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAuthRepository, AUTH_REPOSITORY } from '../../domain/auth.repository';
import { LoginResult } from '../../domain/login-result.entity';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { IntranetValidationService } from '@shared/intranet/intranet-validation.service';
import { IntranetLoginDto } from '../../infrastructure/http/dtos/intranet-login.dto';

@Injectable()
export class IntranetLoginUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly authRepository: IAuthRepository,
    private readonly intranetValidationService: IntranetValidationService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async execute(dto: IntranetLoginDto): Promise<LoginResult> {
    await this.intranetValidationService.validate(dto.email);

    const candidates = (await this.authRepository.findAllByEmail(dto.email)).filter(
      (candidate) => candidate.status !== 'INACTIVO',
    );

    // Un mismo email puede tener varias cuentas (p. ej. Administrador y Participante).
    // Se prioriza cualquier cuenta que no sea Participante (staff) sobre la de Participante.
    const credentials =
      candidates.find((candidate) => candidate.role.code !== 'PARTICIPANTE') ?? candidates[0];

    if (!credentials) {
      throw new UnauthorizedException(
        'Usuario no encontrado, no tienes acceso a esta plataforma, comunícate con el ' +
          'administrador para que te dé acceso, gracias.',
      );
    }

    const role = credentials.role.code ?? credentials.role.name;

    const accessToken = this.jwtTokenService.sign({
      sub: credentials.id,
      email: credentials.email ?? '',
      username: credentials.username ?? '',
      role,
    });

    const refreshToken = this.jwtTokenService.signRefresh(credentials.id, randomUUID());

    return new LoginResult(accessToken, refreshToken, {
      id: credentials.id,
      username: credentials.username,
      email: credentials.email,
      role: credentials.role,
      status: credentials.status,
      person: credentials.person,
      country: credentials.country,
      program: credentials.program,
      sponsor: credentials.sponsor,
      optionProgram: credentials.optionProgram,
    });
  }
}
