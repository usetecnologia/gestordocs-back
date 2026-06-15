import type { Program } from './program.entity';

export interface ProgramFilters {
  page: number;
  limit: number;
  status?: boolean;
  search?: string;
}

export interface CreateProgramData {
  idExterno?: string;
  code: string;
  name: string;
}

export interface UpdateProgramData {
  idExterno?: string;
  code?: string;
  name?: string;
  status?: boolean;
}

export interface IProgramRepository {
  findAll(filters: ProgramFilters): Promise<{ data: Program[]; total: number }>;
  findAllActive(): Promise<Program[]>;
  findAllForSync(): Promise<Program[]>;
  findById(id: string): Promise<Program | null>;
  isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
  create(data: CreateProgramData): Promise<Program>;
  update(id: string, data: UpdateProgramData): Promise<Program>;
  delete(id: string): Promise<void>;
}

export const PROGRAM_REPOSITORY = Symbol('PROGRAM_REPOSITORY');
