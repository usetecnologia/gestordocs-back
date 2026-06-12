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

export interface CreateDocumentData {
  name: string;
  type: TypeDocument;
  formats?: string;
  showHired: TypeHired;
  instructions: string;
  required: boolean;
  sponsorIds?: string[];
  createdById?: string;
}

export interface UpdateDocumentData {
  name?: string;
  type?: TypeDocument;
  formats?: string;
  showHired?: TypeHired;
  instructions?: string;
  required?: boolean;
  status?: boolean;
  sponsorIds?: string[];
  updatedById?: string;
}

export interface IDocumentRepository {
  findAll(filters: DocumentFilters): Promise<{ data: Document[]; total: number }>;
  findById(id: string): Promise<Document | null>;
  create(data: CreateDocumentData): Promise<Document>;
  update(id: string, data: UpdateDocumentData): Promise<Document>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');
