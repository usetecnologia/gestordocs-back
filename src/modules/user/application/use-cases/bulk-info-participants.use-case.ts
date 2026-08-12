import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTOLOGIN_REPOSITORY, IAutoLoginRepository } from '@modules/auth/domain/autologin.repository';
import { WorkuseService } from '@shared/workuse/workuse.service';
import type { WorkuseParticipant } from '@shared/workuse/interfaces/workuse-participant.interface';
import { ResendService } from '@shared/resend/resend.service';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';
import { IUserStatusPort, USER_STATUS_PORT } from '@modules/user-documents/domain/user-status.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';

const DEFAULT_PASSWORD = 'password26';
const ADMIN_CREATED_BY_ID = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';

// Solo se sincronizan participantes de Perú en el programa WAT USA — el resto se descarta.
// Se valida primero por id externo de Workuse (más confiable) y solo si no viene se cae al
// nombre, mismo criterio que usa el repositorio en findOrCreateProgram/findOrCreateSponsor.
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
// Misma lista que usa AutoLoginUseCase — se mantiene duplicada a propósito para no acoplar
// este use case a cambios futuros en el módulo de auth.
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

// Participantes con status "Registered" en Workuse todavía no completaron su registro real —
// se descartan de la sincronización igual que los que no son Perú/WAT USA.
function isRegisteredStatus(status: string | undefined): boolean {
  return status?.trim().toLowerCase() === 'registered';
}

function resolveUserStatus(data: WorkuseParticipant, currentStatus: string | undefined): string | null {
  // Un participante "Retired" en Workuse queda INACTIVO de forma definitiva — este estado
  // ya está en STATUSES_LOCKED_FROM_DOCUMENT_SYNC, por lo que no se reevalúa por documentos.
  if (isRetiredStatus(data.status)) return 'INACTIVO';
  // Solo avanza a ENVIADO_SPONSOR si viene justo de PREPARACION (el paso previo del flujo). Si
  // ya está en cualquier otro estado (OBSERVADO, APROBADO_SPONSOR, etc.) no se toca el status —
  // la fecha igual queda guardada en el upsert, solo se omite el cambio de estado.
  if (data.fechadeenvioalsponsor && currentStatus === 'PREPARACION') return 'ENVIADO_SPONSOR';
  return null;
}

export interface BulkInfoParticipantsResult {
  totalReceived: number;
  filteredOut: number;
  skippedRegistered: number;
  created: string[];
  updated: string[];
  reactivated: string[];
  errors: string[];
}

export interface BulkInfoParticipantsOptions {
  // Usado por el job automático diario — evita el correo de "documento observado" hacia el
  // participante durante la sincronización masiva. La notificación al admin no se ve afectada.
  suppressParticipantEmail?: boolean;
}

@Injectable()
export class BulkInfoParticipantsUseCase {
  private readonly logger = new Logger(BulkInfoParticipantsUseCase.name);

  // Lock en memoria — evita que dos corridas del batch se pisen sobre las mismas filas
  // (upsertByDni no es atómico: hace findFirst y luego create/update en transacciones separadas).
  // Solo funciona porque la app corre como un único proceso Node; si en el futuro se escala a
  // varias instancias, este flag deja de servir y hay que mover el lock a la base de datos
  // (p. ej. GET_LOCK/RELEASE_LOCK de MariaDB) o a un store compartido.
  private isRunning = false;

  constructor(
    private readonly workuseService: WorkuseService,
    @Inject(AUTOLOGIN_REPOSITORY) private readonly autoLoginRepo: IAutoLoginRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: IPasswordHasher,
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    @Inject(USER_STATUS_PORT) private readonly userStatusPort: IUserStatusPort,
    private readonly resendService: ResendService,
  ) {}

  // Expuesto para que el controller pueda responder de inmediato "ya hay una sincronización en
  // curso" sin tener que lanzar (y luego descartar) otra ejecución del batch.
  isSyncInProgress(): boolean {
    return this.isRunning;
  }

  // Corre en background (el controller no espera esta promesa) — un batch completo puede tardar
  // varios minutos y cualquier proxy/gateway delante del server cortaría la conexión mucho antes.
  // Por eso el resultado final no vuelve por HTTP: se loguea y se notifica al admin por correo.
  async execute(options: BulkInfoParticipantsOptions = {}): Promise<BulkInfoParticipantsResult> {
    if (this.isRunning) {
      this.logger.warn('BulkInfoParticipants — ya hay una sincronización en curso, se omite esta ejecución.');
      return { totalReceived: 0, filteredOut: 0, skippedRegistered: 0, created: [], updated: [], reactivated: [], errors: [] };
    }
    this.isRunning = true;

    try {
      return await this.runSync(options);
    } finally {
      this.isRunning = false;
    }
  }

  private async runSync(options: BulkInfoParticipantsOptions): Promise<BulkInfoParticipantsResult> {
    let participants: WorkuseParticipant[];
    try {
      participants = await this.workuseService.fetchParticipantsBulkV2();
    } catch (err) {
      this.logger.error('BulkInfoParticipants — no se pudo obtener la data de Workuse, batch abortado.', err as Error);
      await this.notifyAdmin(
        'Sincronización de participantes (Workuse) FALLÓ',
        `No se pudo iniciar la sincronización: ${err instanceof Error ? err.message : 'error desconocido'}.`,
      );
      throw err;
    }

    this.logger.log(`BulkInfoParticipants — ${participants.length} participantes recibidos de Workuse.`);

    const result: BulkInfoParticipantsResult = {
      totalReceived: participants.length,
      filteredOut: 0,
      skippedRegistered: 0,
      created: [],
      updated: [],
      reactivated: [],
      errors: [],
    };

    for (const item of participants) {
      if (!item.valid || !item.dni) {
        result.errors.push(item.dni || 'sin-dni');
        continue;
      }

      if (!isTargetParticipant(item)) {
        result.filteredOut++;
        continue;
      }

      if (isRegisteredStatus(item.status)) {
        result.skippedRegistered++;
        continue;
      }

      try {
        await this.syncParticipant(item, result, options.suppressParticipantEmail ?? false);
      } catch (err) {
        this.logger.error(`Error al sincronizar participante DNI ${item.dni}`, err as Error);
        result.errors.push(item.dni);
      }
    }

    this.logger.log(
      `BulkInfoParticipants — descartados (no Perú/WAT USA): ${result.filteredOut}, descartados (status Registered): ${result.skippedRegistered}, ` +
        `creados: ${result.created.length}, actualizados: ${result.updated.length}, reactivados: ${result.reactivated.length}, errores: ${result.errors.length}.`,
    );

    await this.notifyAdmin(
      'Sincronización de participantes (Workuse) completada',
      [
        `Total recibidos: ${result.totalReceived}`,
        `Descartados (no Perú/WAT USA): ${result.filteredOut}`,
        `Descartados (status Registered): ${result.skippedRegistered}`,
        `Creados: ${result.created.length}`,
        `Actualizados: ${result.updated.length}`,
        `Reactivados: ${result.reactivated.length}${result.reactivated.length ? ` -> ${result.reactivated.join(', ')}` : ''}`,
        `Errores: ${result.errors.length}${result.errors.length ? ` -> ${result.errors.slice(0, 50).join(', ')}${result.errors.length > 50 ? ' (+' + (result.errors.length - 50) + ' más)' : ''}` : ''}`,
      ].join('\n'),
    );

    return result;
  }

  // El envío de correo nunca debe tumbar el resultado de la sincronización — si falla, solo se
  // loguea (igual que EmailDispatchService, que tampoco lanza ante un fallo de envío).
  private async notifyAdmin(subject: string, text: string): Promise<void> {
    try {
      await this.resendService.notifyAdmin(subject, text);
    } catch (err) {
      this.logger.error('BulkInfoParticipants — no se pudo notificar al admin por correo.', err as Error);
    }
  }

  private async syncParticipant(
    data: WorkuseParticipant,
    result: BulkInfoParticipantsResult,
    suppressParticipantEmail: boolean,
  ): Promise<void> {
    const country = await this.autoLoginRepo.findCountryByName(data.country.trim().toUpperCase());
    if (!country) {
      result.errors.push(data.dni);
      return;
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
    // En este caso no se recalcula por las reglas normales — se restaura el último estado que
    // tuvo antes de pasar a INACTIVO (según su historial). Si no tiene historial previo (o solo
    // tiene entradas INACTIVO), se deja sin estado explícito para que más abajo se reevalúe según
    // el estado real de sus documentos.
    const wasInactive = existing?.status === 'INACTIVO';
    const isReactivation = wasInactive && !isRetiredStatus(data.status);

    const userStatus = isReactivation
      ? await this.userStatusPort.findLastStatusBeforeInactive(existing!.id)
      : resolveUserStatus(data, existing?.status);

    // Solo un participante contratado (status_hired = 1) conserva su sponsor asignado.
    // Si status_hired no es 1 (null, undefined o cualquier otro valor), queda sin sponsor —
    // solo se limpia el vínculo (FK a null), no se borra su historial ni documentos previos.
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

    // El estado final del participante se determina por el estado real de sus documentos
    // (misma lógica de TerminarRevisionUseCase), sin importar si Workuse reporta un estado
    // externo (RETIRADO/ENVIADO_SPONSOR). Excepción: si el participante ya está en un estado
    // "cerrado" del flujo con el sponsor (o retenido/inactivo), no se reevalúa — esos estados
    // no cambian por la sincronización automática de documentos. Si es una reactivación sin
    // historial previo utilizable, se fuerza la reevaluación aunque INACTIVO esté bloqueado.
    const noHistoryReactivation = isReactivation && !userStatus;

    // El participante estaba ENVIADO_SPONSOR pero Workuse ya no reporta fechadeenvioalsponsor
    // (el upsert previo la dejó en null). En ese caso se fuerza la reevaluación por documentos
    // aunque ENVIADO_SPONSOR esté bloqueado: como hasBeenSentToSponsor() lee la fecha ya
    // limpiada en BD, TerminarRevisionUseCase re-derivará el estado real (PREPARACION,
    // DOCUMENTOS_INCOMPLETOS, OBSERVADO, etc.) en lugar de dejarlo atrapado en ENVIADO_SPONSOR.
    const sponsorDateGone =
      existing?.status === 'ENVIADO_SPONSOR' && !data.fechadeenvioalsponsor;

    if (
      noHistoryReactivation ||
      sponsorDateGone ||
      !STATUSES_LOCKED_FROM_DOCUMENT_SYNC.has(credentials.status)
    ) {
      await this.terminarRevisionUseCase.execute(credentials.id, ADMIN_CREATED_BY_ID, suppressParticipantEmail);
    }

    if (isReactivation) {
      result.reactivated.push(data.dni);
    } else if (existing) {
      result.updated.push(data.dni);
    } else {
      result.created.push(data.dni);
    }
  }
}
