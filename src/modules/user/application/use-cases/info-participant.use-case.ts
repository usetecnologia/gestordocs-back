import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AUTOLOGIN_REPOSITORY, IAutoLoginRepository } from '@modules/auth/domain/autologin.repository';
import { WorkuseService } from '@shared/workuse/workuse.service';
import type { WorkuseParticipant } from '@shared/workuse/interfaces/workuse-participant.interface';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';
import { IUserStatusPort, USER_STATUS_PORT } from '@modules/user-documents/domain/user-status.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';

const DEFAULT_PASSWORD = 'password26';
const ADMIN_CREATED_BY_ID = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';

// Solo se sincronizan participantes de Perú en el programa WAT USA — el resto se rechaza.
// Se valida primero por id externo de Workuse (más confiable) y solo si no viene se cae al
// nombre, mismo criterio que usa BulkInfoParticipantsUseCase y AutoLoginUseCase.
const TARGET_COUNTRY_ID = '2';
const TARGET_COUNTRY_NAME = 'PERU';
const TARGET_PROGRAM_ID = '1';
const TARGET_PROGRAM_NAME = 'WAT USA';

function matchesTarget(
  id: string | undefined,
  targetId: string,
  name: string | null | undefined,
  targetName: string,
): boolean {
  const normalizedId = id?.trim();
  if (normalizedId) return normalizedId === targetId;
  return (name ?? '').trim().toUpperCase() === targetName;
}

function isTargetParticipant(data: WorkuseParticipant): boolean {
  const isPeru = matchesTarget(data.countryId, TARGET_COUNTRY_ID, data.country, TARGET_COUNTRY_NAME);
  const isWatUsa = matchesTarget(data.programId, TARGET_PROGRAM_ID, data.program, TARGET_PROGRAM_NAME);
  return isPeru && isWatUsa;
}

// Estados que ya salieron del flujo de revisión de documentos — una vez que el participante
// llega a alguno de ellos, no se deben pisar con la reevaluación automática por documentos.
// Misma lista que usa BulkInfoParticipantsUseCase y AutoLoginUseCase — se mantiene duplicada
// a propósito para no acoplar este use case a cambios futuros en otros módulos.
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
  if (isRetiredStatus(data.status)) return 'INACTIVO';
  if (data.fechadeenvioalsponsor) return 'ENVIADO_SPONSOR';
  return null;
}

export type InfoParticipantAction = 'created' | 'updated' | 'reactivated';

export interface InfoParticipantResult {
  dni: string;
  action: InfoParticipantAction;
}

@Injectable()
export class InfoParticipantUseCase {
  constructor(
    private readonly workuseService: WorkuseService,
    @Inject(AUTOLOGIN_REPOSITORY) private readonly autoLoginRepo: IAutoLoginRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    @Inject(USER_STATUS_PORT) private readonly userStatusPort: IUserStatusPort,
  ) {}

  async execute(dni: string): Promise<InfoParticipantResult> {
    const data = await this.workuseService.fetchParticipantV2(dni);
    console.log(data)
    if (!isTargetParticipant(data)) {
      throw new BadRequestException('El participante no pertenece a Perú / WAT USA.');
    }

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

    const existing = await this.autoLoginRepo.findByDni(data.dni);
    const passwordHash = existing?.passwordHash
      ? existing.passwordHash
      : await this.passwordHasher.hash(DEFAULT_PASSWORD);

    // Reactivación: el participante estaba INACTIVO y Workuse ya no lo reporta como Retired.
    // Restaura el último estado que tuvo antes de pasar a INACTIVO (según su historial). Si no
    // tiene historial previo utilizable, se deja sin estado explícito para que más abajo se
    // reevalúe según el estado real de sus documentos.
    const wasInactive = existing?.status === 'INACTIVO';
    const isReactivation = wasInactive && !isRetiredStatus(data.status);

    const userStatus = isReactivation
      ? await this.userStatusPort.findLastStatusBeforeInactive(existing!.id)
      : resolveUserStatus(data);

    // Solo un participante contratado (status_hired = 1) conserva su sponsor asignado.
    const userSponsorId = data.status_hired === 1 ? sponsorId : null;

    const credentials = await this.autoLoginRepo.upsertByDni({
      dni: data.dni,
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

    // El estado final del participante se determina por el estado real de sus documentos, sin
    // importar el estado externo que reporte Workuse. Excepción: si ya está en un estado
    // "cerrado" del flujo con el sponsor (o retenido/inactivo), no se reevalúa — salvo que sea
    // una reactivación sin historial previo utilizable, donde se fuerza la reevaluación.
    const noHistoryReactivation = isReactivation && !userStatus;
    if (noHistoryReactivation || !STATUSES_LOCKED_FROM_DOCUMENT_SYNC.has(credentials.status)) {
      await this.terminarRevisionUseCase.execute(credentials.id, ADMIN_CREATED_BY_ID, false);
    }

    const action: InfoParticipantAction = isReactivation ? 'reactivated' : existing ? 'updated' : 'created';
    return { dni: data.dni, action };
  }
}
