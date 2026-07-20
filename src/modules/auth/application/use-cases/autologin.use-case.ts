import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IAutoLoginRepository, AUTOLOGIN_REPOSITORY } from '../../domain/autologin.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';
import { LoginResult } from '../../domain/login-result.entity';
import { JwtTokenService } from '@shared/jwt/jwt.service';
import { WorkuseService } from '@shared/workuse/workuse.service';
import type { WorkuseParticipant } from '@shared/workuse/interfaces/workuse-participant.interface';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';
import { IUserStatusPort, USER_STATUS_PORT } from '@modules/user-documents/domain/user-status.port';

const DEFAULT_PASSWORD = 'password26';
const ADMIN_CREATED_BY_ID = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';

// Estados que ya salieron del flujo de revisión de documentos — una vez que el participante
// llega a alguno de ellos, no se deben pisar con la reevaluación automática por documentos.
const STATUSES_LOCKED_FROM_DOCUMENT_SYNC = new Set([
  'ENVIADO_SPONSOR',
  'OBSERVADO_SPONSOR',
  'RECHAZADO_SPONSOR',
  'APROBADO_SPONSOR',
  'DS2019_EMITIDO',
  'RETENIDO_USE',
  'INACTIVO',
]);

const EMPTY_SPONSOR_VALUES = new Set(['', '&NBSP;', '_NBSP_']);

function normalizeSponsor(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return EMPTY_SPONSOR_VALUES.has(trimmed) ? null : trimmed;
}

function isRetiredStatus(status: string | undefined): boolean {
  return status?.trim().toLowerCase() === 'retired';
}

function resolveUserStatus(data: WorkuseParticipant): string | null {
  // Un participante "Retired" en Workuse queda INACTIVO de forma definitiva — este estado
  // ya está en STATUSES_LOCKED_FROM_DOCUMENT_SYNC, por lo que no se reevalúa por documentos.
  if (isRetiredStatus(data.status)) return 'INACTIVO';
  if (data.fechadeenvioalsponsor) return 'ENVIADO_SPONSOR';
  return null;
}

@Injectable()
export class AutoLoginUseCase {
  constructor(
    @Inject(AUTOLOGIN_REPOSITORY) private readonly autoLoginRepo: IAutoLoginRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly jwtTokenService: JwtTokenService,
    private readonly workuseService: WorkuseService,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    @Inject(USER_STATUS_PORT) private readonly userStatusPort: IUserStatusPort,
  ) {}

  async execute(dni: string): Promise<LoginResult> {
    const data = await this.workuseService.fetchParticipant(dni);

    const country = await this.autoLoginRepo.findCountryByName(data.country.trim().toUpperCase());
    if (!country) {
      throw new NotFoundException(`País "${data.country}" no encontrado en la base de datos.`);
    }

    const program = data.program.trim().toUpperCase();
    const sponsor = normalizeSponsor(data.sponsor);
    const optionPrograma = data.optionPrograma.trim().toUpperCase();

    const { id: programId } = await this.autoLoginRepo.findOrCreateProgram(
      program,
      data.programId?.trim() || null,
    );
    const sponsorId = sponsor
      ? (await this.autoLoginRepo.findOrCreateSponsor(sponsor, data.sponsorId?.trim() || null)).id
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

    // Reactivación: el participante estaba INACTIVO y Workuse ya no lo reporta como Retired.
    // En este caso no se recalcula por las reglas normales — se restaura el último estado que
    // tuvo antes de pasar a INACTIVO (según su historial). Si no tiene historial previo (o solo
    // tiene entradas INACTIVO), se deja sin estado explícito para que más abajo se reevalúe según
    // el estado real de sus documentos.
    const wasInactive = existing?.status === 'INACTIVO';
    const isReactivation = wasInactive && !isRetiredStatus(data.status);

    const userStatus = isReactivation
      ? await this.userStatusPort.findLastStatusBeforeInactive(existing!.id)
      : resolveUserStatus(data);

    // Solo un participante contratado (status_hired = 1) conserva su sponsor asignado.
    // Si status_hired no es 1 (null, undefined o cualquier otro valor), queda sin sponsor —
    // solo se limpia el vínculo (FK a null), no se borra su historial ni documentos previos.
    const userSponsorId = data.status_hired === 1 ? sponsorId : null;

    const credentials = await this.autoLoginRepo.upsertByDni({
      dni,
      firstname: data.firstname,
      middlename: data.middlename || null,
      lastfathername: data.lastfathername,
      lastmothername: data.lastmothername || null,
      birthdate: data.birthdate || null,
      countryId: country.id,
      programId,
      sponsorId: userSponsorId,
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
      email: data.email || null,
    });

    await this.syncUserDocumentsUseCase.execute(credentials.id, credentials.sponsor?.code ?? null);

    // El estado final del participante se determina por el estado real de sus documentos
    // (misma lógica de TerminarRevisionUseCase), sin importar si Workuse reporta un estado
    // externo (RETIRADO/ENVIADO_SPONSOR). Esto evita que quede desactualizado (p. ej. en
    // PREPARACION) cuando el sync anterior le agregó documentos nuevos en PENDIENTE por un
    // cambio de sponsor. Excepción: si el participante ya está en un estado "cerrado" del
    // flujo con el sponsor (o retenido/inactivo), no se reevalúa — esos estados no cambian
    // por la sincronización automática de documentos.
    // Si es una reactivación sin historial previo utilizable, el estado sigue como INACTIVO en
    // la BD (no se envió userStatus al upsert) — forzamos la reevaluación por documentos aunque
    // INACTIVO esté en el set de estados "bloqueados".
    const noHistoryReactivation = isReactivation && !userStatus;

    let currentStatus = credentials.status;
    if (noHistoryReactivation || !STATUSES_LOCKED_FROM_DOCUMENT_SYNC.has(credentials.status)) {
      await this.terminarRevisionUseCase.execute(credentials.id, ADMIN_CREATED_BY_ID);
      currentStatus = (await this.autoLoginRepo.findByDni(dni))?.status ?? currentStatus;
    }

    if (currentStatus === 'INACTIVO') {
      throw new UnauthorizedException('El usuario se encuentra retirado y no puede iniciar sesión.');
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
      status: currentStatus,
      person: credentials.person,
      country: credentials.country,
      program: credentials.program,
      sponsor: credentials.sponsor,
      optionProgram: credentials.optionProgram,
    });
  }
}
