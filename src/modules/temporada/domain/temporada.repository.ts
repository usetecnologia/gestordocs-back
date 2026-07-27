import type { Temporada } from './temporada.entity';

export interface TemporadaFilters {
  page: number;
  limit: number;
  programId: string;
  status?: boolean;
  search?: string;
}

export interface CreateTemporadaData {
  programId: string;
  name: string;
  status?: boolean;
}

export interface UpdateTemporadaData {
  programId?: string;
  name?: string;
  status?: boolean;
}

export interface ITemporadaRepository {
  // Listado paginado de todas las temporadas de un programa (cualquier estado).
  findAll(filters: TemporadaFilters): Promise<{ data: Temporada[]; total: number }>;
  // Solo temporadas activas que pertenecen a uno o más programas.
  findActiveByProgramIds(programIds: string[]): Promise<Temporada[]>;
  findById(id: string): Promise<Temporada | null>;
  // Valida que no exista otra temporada con el mismo nombre dentro del mismo programa.
  isNameTaken(name: string, programId: string, excludeId?: string): Promise<boolean>;
  create(data: CreateTemporadaData): Promise<Temporada>;
  update(id: string, data: UpdateTemporadaData): Promise<Temporada>;
  delete(id: string): Promise<void>;
}

export const TEMPORADA_REPOSITORY = Symbol('TEMPORADA_REPOSITORY');
