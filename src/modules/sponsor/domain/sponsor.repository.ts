import type { Sponsor } from './sponsor.entity';

export interface SponsorFilters {
  page: number;
  limit: number;
  status?: boolean;
  search?: string;
}

export interface CreateSponsorData {
  idExterno?: string;
  code: string;
  name: string;
}

export interface UpdateSponsorData {
  idExterno?: string;
  code?: string;
  name?: string;
  status?: boolean;
}

export interface ISponsorRepository {
  findAll(filters: SponsorFilters): Promise<{ data: Sponsor[]; total: number }>;
  findAllActive(): Promise<Sponsor[]>;
  findAllForSync(): Promise<Sponsor[]>;
  findById(id: string): Promise<Sponsor | null>;
  isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
  create(data: CreateSponsorData): Promise<Sponsor>;
  update(id: string, data: UpdateSponsorData): Promise<Sponsor>;
  delete(id: string): Promise<void>;
}

export const SPONSOR_REPOSITORY = Symbol('SPONSOR_REPOSITORY');
