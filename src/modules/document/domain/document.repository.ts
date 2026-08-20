import type { Document } from './document.entity';
import type { TypeDocument, TypeHired } from './document.enums';

export interface DocumentFilters {
  page: number;
  limit: number;
  type?: TypeDocument;
  showHired?: TypeHired;
  status?: boolean;
  search?: string;
  /** Documentos vinculados explícitamente a este sponsor. */
  sponsorId?: string;
  /** Documentos asociados a este programa. */
  programId?: string;
  /** Documentos con al menos una descripción configurada para este país. */
  countryId?: string;
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
  /** Opcional. `null` desvincula la temporada; `undefined` en create equivale a null. */
  temporadaId?: string | null;
  status?: boolean;
  descriptions?: DocumentProgramDescriptionInputData[];
}

/** Par temporada -> programa al que pertenece, para validar que la asignacion sea coherente. */
export interface TemporadaProgramRef {
  id: string;
  programId: string;
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

/**
 * Dimensiones con las que se decide si un documento le corresponde a un participante.
 * `sponsorCode` sigue la regla histórica "sin vínculos activos = aplica a todos";
 * `programId` y `countryId` son estrictamente explícitos (ver `findApplicableForParticipant`).
 */
export interface ParticipantDocumentFilter {
  sponsorCode: string | null;
  programId: string | null;
  countryId: string | null;
}

export interface IDocumentRepository {
  findAll(filters: DocumentFilters): Promise<{ data: Document[]; total: number }>;
  findAllActive(): Promise<Document[]>;
  findBySponsorCode(sponsorCode: string): Promise<Document[]>;
  findApplicableForParticipant(filter: ParticipantDocumentFilter): Promise<Document[]>;
  findInformativeBySponsorIds(sponsorIds: string[]): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  findCountriesByDocumentId(documentId: string): Promise<DocumentCountryItem[]>;
  /** Resuelve a que programa pertenece cada temporada. Las que no existen no vienen en la respuesta. */
  findTemporadaRefs(temporadaIds: string[]): Promise<TemporadaProgramRef[]>;
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

/**
 * Temporadas asignadas a un programa que no les corresponde, o que ya no existen.
 * La clave foranea solo garantiza que la temporada exista: nada a nivel de base de datos
 * impide asignarle a "WAT USA" una temporada que pertenece a "Internship USA".
 */
export interface InvalidTemporadaAssignment {
  temporadaId: string;
  programId: string;
  reason: 'NOT_FOUND' | 'WRONG_PROGRAM';
}

export function findInvalidTemporadaAssignments(
  programs: DocumentProgramInputData[],
  refs: TemporadaProgramRef[],
): InvalidTemporadaAssignment[] {
  const programIdByTemporadaId = new Map(refs.map((r) => [r.id, r.programId]));
  const invalid: InvalidTemporadaAssignment[] = [];

  for (const p of programs) {
    if (!p.temporadaId) continue;
    const owner = programIdByTemporadaId.get(p.temporadaId);
    if (owner === undefined) {
      invalid.push({ temporadaId: p.temporadaId, programId: p.programId, reason: 'NOT_FOUND' });
    } else if (owner !== p.programId) {
      invalid.push({ temporadaId: p.temporadaId, programId: p.programId, reason: 'WRONG_PROGRAM' });
    }
  }

  return invalid;
}

/** Temporadas referenciadas por la solicitud, sin repetidos y sin nulos. */
export function collectTemporadaIds(programs: DocumentProgramInputData[]): string[] {
  return [...new Set(programs.map((p) => p.temporadaId).filter((id): id is string => !!id))];
}
