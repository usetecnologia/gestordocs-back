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
  name: string;
  shortName: string;
  shortDatabase: string;
  countryId: string;
  programId: string;
  sponsorId: string;
  hideJobFair: boolean;
}

export interface UpdateOptionProgramData {
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
  findById(id: string): Promise<OptionProgram | null>;
  create(data: CreateOptionProgramData): Promise<OptionProgram>;
  update(id: string, data: UpdateOptionProgramData): Promise<OptionProgram>;
  delete(id: string): Promise<void>;
}

export const OPTION_PROGRAM_REPOSITORY = Symbol('OPTION_PROGRAM_REPOSITORY');
