import type { OptionProgram } from './option-program.entity';

export interface OptionProgramFilters {
  page: number;
  limit: number;
  status?: boolean;
  countryId?: string;
  programId?: string;
  sponsorId?: string;
  search?: string;
}

export interface CreateOptionProgramData {
  idExterno?: string;
  name: string;
  shortName: string;
  shortDatabase: string;
  countryId: string;
  programId: string;
  sponsorId?: string | null;
  hideJobFair: boolean;
}

// Fila liviana para el sync masivo (link-data): solo lo necesario para matchear por idExterno.
export interface OptionProgramSyncRow {
  id: string;
  idExterno: string | null;
}

export interface UpdateOptionProgramData {
  idExterno?: string;
  name?: string;
  shortName?: string;
  shortDatabase?: string;
  countryId?: string;
  programId?: string;
  sponsorId?: string;
  status?: boolean;
  hideJobFair?: boolean;
}

export interface IOptionProgramRepository {
  findAll(filters: OptionProgramFilters): Promise<{ data: OptionProgram[]; total: number }>;
  findAllForSync(): Promise<OptionProgramSyncRow[]>;
  findById(id: string): Promise<OptionProgram | null>;
  create(data: CreateOptionProgramData): Promise<OptionProgram>;
  update(id: string, data: UpdateOptionProgramData): Promise<OptionProgram>;
  delete(id: string): Promise<void>;
}

export const OPTION_PROGRAM_REPOSITORY = Symbol('OPTION_PROGRAM_REPOSITORY');
