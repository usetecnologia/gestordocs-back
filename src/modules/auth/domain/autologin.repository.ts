import type { AuthCredentials } from './auth-credentials';

export interface UpsertByDniData {
  dni: string;
  firstname: string;
  middlename?: string | null;
  lastfathername: string;
  lastmothername?: string | null;
  birthdate?: string | null;
  countryId?: string | null;
  programId?: string | null;
  sponsorId?: string | null;
  optionProgramId?: string | null;
  passwordHash: string;
  employer?: string | null;
  status_hired?: number | null;
  hired_date?: string | null;
  jo_use_date?: string | null;
  programAgreementOK?: boolean | null;
  fechadeenvioalsponsor?: string | null;
  fechaDSinUSE?: string | null;
  statusSolRetiro?: string | null;
  statusExternal?: string | null;
  userStatus?: string | null;
  email?: string | null;
}

export interface IAutoLoginRepository {
  findByDni(dni: string): Promise<AuthCredentials | null>;
  findCountryByName(name: string): Promise<{ id: string } | null>;
  findOrCreateProgram(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateSponsor(code: string, externalId: string | null): Promise<{ id: string }>;
  findOrCreateOptionProgram(
    name: string,
    countryId: string,
    programId: string,
    sponsorId: string | null,
  ): Promise<{ id: string }>;
  upsertByDni(data: UpsertByDniData): Promise<AuthCredentials>;
  findDefaultRole(): Promise<{ id: string; name: string; code: string | null }>;
}

export const AUTOLOGIN_REPOSITORY = Symbol('AUTOLOGIN_REPOSITORY');
