import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAutoLoginRepository, AUTOLOGIN_REPOSITORY } from '../../domain/autologin.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';
import { LoginResult } from '../../domain/login-result.entity';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';

const WORKUSE_USER_URL = 'https://secure.workuse.com/api/user/user.php';
const DEFAULT_PASSWORD = 'password26';

const EMPTY_SPONSOR_VALUES = new Set(['', '&NBSP;', '_NBSP_']);

function normalizeSponsor(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return EMPTY_SPONSOR_VALUES.has(trimmed) ? null : trimmed;
}

function resolveUserStatus(data: WorkuseResponse): string | null {
  if (data.status?.trim().toLowerCase() === 'retired') return 'RETIRADO';
  if (data.fechadeenvioalsponsor) return 'ENVIADO_SPONSOR';
  return null;
}

interface WorkuseResponse {
  valid: boolean;
  firstname: string;
  middlename: string;
  lastfathername: string;
  lastmothername: string;
  dni: string;
  birthdate: string;
  country: string;
  program: string;
  sponsor: string;
  optionPrograma: string;
  employer?: string;
  status_hired?: number;
  hired_date?: string;
  jo_use_date?: string;
  programAgreementOK?: boolean;
  fechadeenvioalsponsor?: string;
  fechaDSinUSE?: string;
  statusSolRetiro?: string;
  status?: string;
}

@Injectable()
export class AutoLoginUseCase {
  constructor(
    @Inject(AUTOLOGIN_REPOSITORY) private readonly autoLoginRepo: IAutoLoginRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly jwtTokenService: JwtTokenService,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
  ) {}

  async execute(dni: string): Promise<LoginResult> {
    const data = await this.fetchFromWorkuse(dni);

    const country = await this.autoLoginRepo.findCountryByName(data.country.trim().toUpperCase());
    if (!country) {
      throw new NotFoundException(`País "${data.country}" no encontrado en la base de datos.`);
    }

    const program = data.program.trim().toUpperCase();
    const sponsor = normalizeSponsor(data.sponsor);
    const optionPrograma = data.optionPrograma.trim().toUpperCase();

    const { id: programId } = await this.autoLoginRepo.findOrCreateProgram(program);
    const sponsorId = sponsor
      ? (await this.autoLoginRepo.findOrCreateSponsor(sponsor)).id
      : null;
    const { id: optionProgramId } = await this.autoLoginRepo.findOrCreateOptionProgram(
      optionPrograma,
      country.id,
      programId,
      sponsorId,
    );

    const existing = await this.autoLoginRepo.findByDni(dni);
    const passwordHash = existing?.passwordHash
      ? existing.passwordHash
      : await this.passwordHasher.hash(DEFAULT_PASSWORD);

    const userStatus = resolveUserStatus(data);

    const credentials = await this.autoLoginRepo.upsertByDni({
      dni,
      firstname: data.firstname,
      middlename: data.middlename || null,
      lastfathername: data.lastfathername,
      lastmothername: data.lastmothername || null,
      birthdate: data.birthdate || null,
      countryId: country.id,
      programId,
      sponsorId,
      optionProgramId,
      passwordHash,
      employer: data.employer || null,
      status_hired: data.status_hired ?? null,
      hired_date: data.hired_date || null,
      jo_use_date: data.jo_use_date || null,
      programAgreementOK: data.programAgreementOK ?? null,
      fechadeenvioalsponsor: data.fechadeenvioalsponsor || null,
      fechaDSinUSE: data.fechaDSinUSE || null,
      statusSolRetiro: data.statusSolRetiro || null,
      statusExternal: data.status || null,
      userStatus,
    });

    await this.syncUserDocumentsUseCase.execute(credentials.id, credentials.sponsor?.code ?? null);

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

  private async fetchFromWorkuse(dni: string): Promise<WorkuseResponse> {
    let response: Response;
    try {
      response = await fetch(WORKUSE_USER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni }),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo conectar con el servicio externo.');
    }

    const raw = (await response.json().catch(() => null)) as WorkuseResponse | null;
    console.log('[AutoLogin] Respuesta de Workuse:', raw);

    if (!response.ok || !raw?.valid) {
      throw new NotFoundException('Usuario no encontrado en Workuse.');
    }

    return raw;
  }
}
