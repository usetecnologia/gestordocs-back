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
}

export interface CreateDocumentData {
  title: string;
  name: string;
  type: TypeDocument;
  formats?: string;
  showHired: TypeHired;
  instructions: string;
  sponsors?: DocumentSponsorInputData[];
  createdById?: string;
}

export interface UpdateDocumentData {
  title?: string;
  name?: string;
  type?: TypeDocument;
  formats?: string;
  showHired?: TypeHired;
  instructions?: string;
  status?: boolean;
  sponsors?: DocumentSponsorInputData[];
  updatedById?: string;
}

export interface IDocumentRepository {
  findAll(filters: DocumentFilters): Promise<{ data: Document[]; total: number }>;
  findBySponsorCode(sponsorCode: string): Promise<Document[]>;
  findById(id: string): Promise<Document | null>;
  create(data: CreateDocumentData): Promise<Document>;
  update(id: string, data: UpdateDocumentData): Promise<Document>;
  delete(id: string): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');
