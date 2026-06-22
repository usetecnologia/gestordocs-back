export interface ExistingUserDocument {
  id: string;
  userId: string;
  documentSponsorId: string | null;
  documentId: string | null;
  status: string;
  statusDocument: boolean;
}

export interface CreateUserDocumentWithHistoryData {
  userId: string;
  documentSponsorId?: string | null;
  documentId?: string | null;
}

export interface UserDocumentHistoryItem {
  id: string;
  userDocumentsId: string;
  status: string;
  url: string | null;
  observation: string | null;
  etiquetas: { id: string; name: string }[];
  createdById: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocumentDocumentInfo {
  id: string;
  name: string;
  title: string;
  type: string;
  formats: string | null;
  instructions: string;
  required: boolean;
}

export interface UserDocumentWithHistory {
  id: string;
  documentSponsorId: string | null;
  documentId: string | null;
  userId: string;
  status: string;
  statusDocument: boolean;
  createdAt: Date;
  updatedAt: Date;
  documentSponsor: {
    id: string;
    documentId: string;
    sponsorId: string;
    required: boolean;
    order: number;
    document: UserDocumentDocumentInfo;
    sponsor: { id: string; name: string; code: string };
  } | null;
  document: UserDocumentDocumentInfo | null;
  history: UserDocumentHistoryItem[];
}

export interface RequiredDocsCount {
  totalRequired: number;
  submittedRequired: number;
}

export interface AceptarDocumentData {
  userDocumentId: string;
  reviewedById: string;
  url: string | null;
}

export interface ObservarDocumentData {
  userDocumentId: string;
  observation: string;
  etiquetaIds: string[];
  reviewedById: string;
  url: string | null;
}

export enum UserDocumentFilter {
  ALL = 'ALL',
  REQUIRED = 'REQUIRED',
  OBSERVED = 'OBSERVED',
}

export interface IUserDocumentsRepository {
  findByUserId(userId: string): Promise<ExistingUserDocument[]>;
  findUserSponsorCode(userId: string): Promise<string | null>;
  findByUserIdWithHistory(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]>;
  findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null>;
  createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void>;
  updateStatusDocument(id: string, statusDocument: boolean): Promise<void>;
  addHistory(userDocumentsId: string, status: string, url: string, createdById: string): Promise<void>;
  countRequiredDocs(userId: string): Promise<RequiredDocsCount>;
  aceptarDocument(data: AceptarDocumentData): Promise<void>;
  observarDocument(data: ObservarDocumentData): Promise<void>;
}

export const USER_DOCUMENTS_REPOSITORY = Symbol('USER_DOCUMENTS_REPOSITORY');
