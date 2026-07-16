import type { Document } from './document.entity';
import type { TypeDocument, TypeHired } from './document.enums';

export interface DocumentFilters {
  page: number;
  limit: number;
  type?: TypeDocument;
  showHired?: TypeHired;
  status?: boolean;
  search?: string;
}

export interface DocumentSponsorInputData {
  sponsorId: string;
  required?: boolean;
  order: number;
}

export interface DocumentProgramDescriptionInputData {
  title: string;
  description: string;
  countryIds: string[];
}

export interface DocumentProgramInputData {
  programId: string;
  status?: boolean;
  descriptions?: DocumentProgramDescriptionInputData[];
}

export interface DocumentCountryItem {
  id: string;
  code: string;
  name: string;
}

export interface CreateDocumentData {
  title?: string;
  name: string;
  type: TypeDocument;
  formats?: string;
  showHired: TypeHired;
  siglasCode?: string;
  order?: number;
  instructions?: string;
  required?: boolean;
  status?: boolean;
  sponsors?: DocumentSponsorInputData[];
  programs?: DocumentProgramInputData[];
  createdById?: string;
}

export interface UpdateDocumentData {
  title?: string;
  name?: string;
  type?: TypeDocument;
  formats?: string;
  showHired?: TypeHired;
  siglasCode?: string;
  order?: number;
  instructions?: string;
  required?: boolean;
  status?: boolean;
  sponsors?: DocumentSponsorInputData[];
  programs?: DocumentProgramInputData[];
  updatedById?: string;
}

export interface IDocumentRepository {
  findAll(filters: DocumentFilters): Promise<{ data: Document[]; total: number }>;
  findAllActive(): Promise<Document[]>;
  findBySponsorCode(sponsorCode: string): Promise<Document[]>;
  findInformativeBySponsorIds(sponsorIds: string[]): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  findCountriesByDocumentId(documentId: string): Promise<DocumentCountryItem[]>;
  create(data: CreateDocumentData): Promise<Document>;
  update(id: string, data: UpdateDocumentData): Promise<Document>;
  updateOrder(id: string, order: number | null): Promise<Document | null>;
  normalizeOrder(): Promise<Document[]>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export function findDuplicateProgramIds(programs: DocumentProgramInputData[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const p of programs) {
    if (seen.has(p.programId)) duplicates.add(p.programId);
    seen.add(p.programId);
  }
  return [...duplicates];
}

export function findDuplicateCountryIds(program: DocumentProgramInputData): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const d of program.descriptions ?? []) {
    for (const countryId of d.countryIds) {
      if (seen.has(countryId)) duplicates.add(countryId);
      seen.add(countryId);
    }
  }
  return [...duplicates];
}
