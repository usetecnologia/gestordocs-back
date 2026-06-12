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
}

export interface IAutoLoginRepository {
  findByDni(dni: string): Promise<AuthCredentials | null>;
  findCountryByName(name: string): Promise<{ id: string } | null>;
  findOrCreateProgram(name: string): Promise<{ id: string }>;
  findOrCreateSponsor(name: string): Promise<{ id: string }>;
  findOrCreateOptionProgram(
    name: string,
    countryId: string,
    programId: string,
    sponsorId: string,
  ): Promise<{ id: string }>;
  upsertByDni(data: UpsertByDniData): Promise<AuthCredentials>;
  findDefaultRole(): Promise<{ id: string; name: string; code: string | null }>;
}

export const AUTOLOGIN_REPOSITORY = Symbol('AUTOLOGIN_REPOSITORY');
