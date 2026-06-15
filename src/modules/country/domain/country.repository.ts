import type { Country } from './country.entity';

export interface CountryFilters {
  page: number;
  limit: number;
  status?: boolean;
  search?: string;
}

export interface CreateCountryData {
  idExterno?: string;
  code: string;
  name: string;
  currency?: string;
  countryCode?: string;
}

export interface UpdateCountryData {
  idExterno?: string;
  code?: string;
  name?: string;
  currency?: string;
  countryCode?: string;
  status?: boolean;
}

export interface ICountryRepository {
  findAll(filters: CountryFilters): Promise<{ data: Country[]; total: number }>;
  findAllActive(): Promise<Country[]>;
  findAllForSync(): Promise<Country[]>;
  findById(id: string): Promise<Country | null>;
  isCodeTaken(code: string, excludeId?: string): Promise<boolean>;
  create(data: CreateCountryData): Promise<Country>;
  update(id: string, data: UpdateCountryData): Promise<Country>;
  delete(id: string): Promise<void>;
}

export const COUNTRY_REPOSITORY = Symbol('COUNTRY_REPOSITORY');
