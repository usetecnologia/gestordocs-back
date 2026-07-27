import type { OptionProgram } from './option-program.entity';

export interface OptionProgramFilters {
  page: number;
  limit: number;
  status?: boolean;
  programId?: string;
  search?: string;
}

export interface CreateOptionProgramData {
  shortDatabase: string;
  programId: string;
  status?: boolean;
}

// Fila liviana para el sync masivo (link-data): lo necesario para matchear por (programId, shortDatabase).
export interface OptionProgramSyncRow {
  id: string;
  programId: string;
  shortDatabase: string;
}

export interface UpdateOptionProgramData {
  shortDatabase?: string;
  programId?: string;
  status?: boolean;
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
