import type { User } from './user.entity';
import type { UserStatus } from './user.enums';

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
  search?: string;
  sortBy?: 'firstname' | 'lastfathername';
  sortOrder?: 'asc' | 'desc';
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
  username?: string;
  email?: string;
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
  programId?: string;
  optionProgramId?: string;
  search?: string;
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
  findAll(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findAllStaff(filters: UserFilters): Promise<{ data: User[]; total: number }>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<void>;
  addStatusHistory(userId: string, status: UserStatus, createdById?: string): Promise<void>;
  createObservation(data: CreateObservationData): Promise<ObservationResult>;
  closeObservation(observationId: string): Promise<string>;
  existsByDni(dni: string): Promise<boolean>;
  findCountryByName(name: string): Promise<{ id: string } | null>;
  findOrCreateProgram(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateSponsor(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateOptionProgram(name: string, countryId: string, programId: string, sponsorId: string | null): Promise<{ id: string }>;
  findDefaultRole(): Promise<{ id: string }>;
  createWithHistory(data: CreateExternalUserData): Promise<void>;
  updateByDni(dni: string, data: UpdateExternalUserData): Promise<void>;
  findAllForExport(filters: ExportUsersFilters): Promise<ExportUserRow[]>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
