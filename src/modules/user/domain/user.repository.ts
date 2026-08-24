import type { User } from './user.entity';
import type { UserStatus } from './user.enums';

// Valores especiales aceptados en los filtros `sponsorId` de los reportes.
// SIN_SPONSOR = participantes sin ningún sponsor asociado (sponsorId es NULL).
// CON_SPONSOR = participantes con al menos un sponsor asociado (sponsorId no es NULL).
export const NO_SPONSOR_FILTER_VALUE = 'SIN_SPONSOR';
export const WITH_SPONSOR_FILTER_VALUE = 'CON_SPONSOR';

export function isNoSponsorFilter(sponsorId?: string): boolean {
  return sponsorId === NO_SPONSOR_FILTER_VALUE;
}

export function isWithSponsorFilter(sponsorId?: string): boolean {
  return sponsorId === WITH_SPONSOR_FILTER_VALUE;
}

export interface CreateObservationData {
  participantId: string;
  observation: string;
  createdById: string;
  etiquetaIds?: string[];
  files?: string[];
}

export interface ObservationResult {
  id: string;
  userId: string;
  observation: string;
  status: boolean;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  createdBy: { id: string; fullName: string } | null;
  etiquetas: { id: string; name: string }[];
  files: { id: string; file: string }[];
}

export interface UserFilters {
  page: number;
  limit: number;
  status?: UserStatus;
  roleId?: string;
  countryId?: string;
  sponsorId?: string;
  hasSponsor?: boolean;
  programId?: string;
  optionProgramId?: string;
  statusSolRetiro?: 'ACCEPTED' | 'INPROCESS';
  generalStatus?: 'ACTIVO' | 'INACTIVO';
  fechaEnvioSponsor?: 'SI' | 'NO';
  /**
   * Estado del ciclo. Solo lo usa `findAllByProceso`, donde cada fila es un proceso: filtra las
   * filas por si su ciclo está abierto o cerrado. `findAll` lo ignora — ahí una fila es una persona
   * y no tiene un solo estado de ciclo.
   */
  procesoEstado?: 'EN_PROCESO' | 'FINALIZADO';
  search?: string;
  sortBy?: 'firstname' | 'lastfathername';
  sortOrder?: 'asc' | 'desc';
  createdFrom?: Date;
  createdTo?: Date;
  ids?: string[];
}

export interface PreviousStatusFilters {
  sponsorId?: string;
  programId?: string;
  countryId?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

export interface UserStatusFunnelFilters {
  sponsorId?: string;
  programId?: string;
  countryId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  generalStatus?: 'ACTIVO' | 'INACTIVO';
}

export interface UserStatusCount {
  status: UserStatus;
  count: number;
}

export interface FunnelExportFilters {
  status: UserStatus;
  sponsorId?: string;
  programId?: string;
  countryId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  generalStatus?: 'ACTIVO' | 'INACTIVO';
}

export interface FunnelExportRow {
  dni: string | null;
  lastname: string;
  firstname: string;
  program: string | null;
  country: string | null;
  sponsor: string | null;
  email: string | null;
  statusSolRetiro: string | null;
  status: UserStatus;
}

export interface CreateUserData {
  firstname: string;
  middlename?: string;
  lastfathername: string;
  lastmothername?: string;
  birthdate?: string;
  phone?: string;
  username?: string;
  email?: string;
  password?: string;
  roleId: string;
  countryId?: string;
  sponsorId?: string;
  programId?: string;
  optionProgramId?: string;
  status?: UserStatus;
}

export interface UpdateUserData {
  firstname?: string;
  middlename?: string;
  lastfathername?: string;
  lastmothername?: string;
  birthdate?: string;
  phone?: string;
  avatar?: string;
  username?: string | null;
  email?: string | null;
  password?: string;
  roleId?: string;
  countryId?: string;
  sponsorId?: string;
  programId?: string;
  optionProgramId?: string;
  status?: UserStatus;
}

export interface CreateExternalUserData {
  dni: string;
  firstname: string;
  middlename?: string | null;
  lastfathername: string;
  lastmothername?: string | null;
  birthdate?: string | null;
  roleId: string;
  countryId?: string | null;
  programId?: string | null;
  sponsorId?: string | null;
  optionProgramId?: string | null;
  passwordHash: string;
  status: string;
  employer?: string | null;
  status_hired?: number | null;
  hired_date?: string | null;
  jo_use_date?: string | null;
  programAgreementOK?: boolean | null;
  fechadeenvioalsponsor?: string | null;
  fechaDSinUSE?: string | null;
  statusSolRetiro?: string | null;
  statusExternal?: string | null;
}

export interface UpdateExternalUserData {
  firstname: string;
  middlename?: string | null;
  lastfathername: string;
  lastmothername?: string | null;
  birthdate?: string | null;
  countryId?: string | null;
  programId?: string | null;
  sponsorId?: string | null;
  optionProgramId?: string | null;
  status: string;
  employer?: string | null;
  email?: string | null;
  status_hired?: number | null;
  hired_date?: string | null;
  jo_use_date?: string | null;
  programAgreementOK?: boolean | null;
  fechadeenvioalsponsor?: string | null;
  fechaDSinUSE?: string | null;
  statusSolRetiro?: string | null;
  statusExternal?: string | null;
}

export interface ExportUsersFilters {
  status?: UserStatus;
  roleId?: string;
  countryId?: string;
  sponsorId?: string;
  hasSponsor?: boolean;
  programId?: string;
  optionProgramId?: string;
  statusSolRetiro?: 'ACCEPTED' | 'INPROCESS';
  generalStatus?: 'ACTIVO' | 'INACTIVO';
  search?: string;
  sortBy?: 'firstname' | 'lastfathername';
  sortOrder?: 'asc' | 'desc';
}

export interface ExportUserRow {
  id: string;
  dni: string | null;
  firstname: string;
  middlename: string | null;
  lastfathername: string;
  lastmothername: string | null;
  status_hired: number | null;
  sponsor: string | null;
  status: string;
}

export interface IUserRepository {
  /**
   * Listado de participantes **por ciclo**: una fila por proceso, no por persona. Un participante
   * con dos ciclos devuelve dos filas.
   *
   * Los filtros propios del ciclo —estado documental, sponsor, programa, país, opción— se aplican
   * al proceso de la fila; los del participante —búsqueda por nombre o DNI, solicitud de retiro,
   * fecha de envío al sponsor— siguen aplicándose a la persona.
   *
   * Es un método aparte de `findAll` a propósito: el dashboard usa `findAll` para contar
   * participantes por estado, y ahí duplicar a alguien por tener dos ciclos sería un error.
   */
  findAllByProceso(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findAll(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findAllStaff(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  countByStatus(statuses: UserStatus[], filters: UserStatusFunnelFilters): Promise<UserStatusCount[]>;
  findAllForFunnelExport(filters: FunnelExportFilters): Promise<FunnelExportRow[]>;
  findInactiveIdsByPreviousStatus(status: UserStatus, filters: PreviousStatusFilters): Promise<string[]>;
  /**
   * `procesoId` acota el detalle a un ciclo concreto: sus documentos, observaciones, correos e
   * historial. Sin él se muestra el ciclo en curso. Se usa para revisar un ciclo archivado desde el
   * listado, que es de solo lectura — un ciclo cerrado está congelado.
   *
   * Un `procesoId` que no sea de ese participante se ignora y se cae al ciclo en curso: es un
   * parámetro que viene de la URL y no debe poder mostrar el ciclo de otra persona.
   */
  findById(id: string, procesoId?: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
  isUsernameTaken(username: string, excludeId?: string): Promise<boolean>;
  isEmailTaken(email: string, excludeId?: string): Promise<boolean>;
  addStatusHistory(userId: string, status: UserStatus, createdById?: string): Promise<void>;
  createObservation(data: CreateObservationData): Promise<ObservationResult>;
  closeObservation(observationId: string): Promise<string>;
  findActiveObservationTexts(userId: string): Promise<string[]>;
  existsByDni(dni: string): Promise<boolean>;
  findCountryByName(name: string): Promise<{ id: string } | null>;
  findOrCreateProgram(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateSponsor(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateOptionProgram(shortDatabase: string, programId: string): Promise<{ id: string }>;
  findDefaultRole(): Promise<{ id: string }>;
  createWithHistory(data: CreateExternalUserData): Promise<void>;
  updateByDni(dni: string, data: UpdateExternalUserData): Promise<void>;
  findAllForExport(filters: ExportUsersFilters): Promise<ExportUserRow[]>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
