import type { Etiqueta } from './etiqueta.entity';

export interface EtiquetaFilters {
  page: number;
  limit: number;
  status?: boolean;
  search?: string;
}

export interface CreateEtiquetaData {
  name: string;
  createdById?: string;
}

export interface UpdateEtiquetaData {
  name?: string;
  status?: boolean;
  updatedById?: string;
}

export interface IEtiquetaRepository {
  findAll(
    filters: EtiquetaFilters,
  ): Promise<{ data: Etiqueta[]; total: number }>;
  findAllActive(): Promise<Etiqueta[]>;
  findById(id: string): Promise<Etiqueta | null>;
  create(data: CreateEtiquetaData): Promise<Etiqueta>;
  update(id: string, data: UpdateEtiquetaData): Promise<Etiqueta>;
  delete(id: string): Promise<void>;
}

export const ETIQUETA_REPOSITORY = Symbol('ETIQUETA_REPOSITORY');
