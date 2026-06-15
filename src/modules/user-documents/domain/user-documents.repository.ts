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
  etiquetaId: string | null;
  etiqueta: { id: string; name: string } | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDocumentDocumentInfo {
  id: string;
  name: string;
  title: string;
  type: string;
  instructions: string;
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

export interface IUserDocumentsRepository {
  findByUserId(userId: string): Promise<ExistingUserDocument[]>;
  findByUserIdWithHistory(userId: string): Promise<UserDocumentWithHistory[]>;
  findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null>;
  createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void>;
  updateStatusDocument(id: string, statusDocument: boolean): Promise<void>;
  addHistory(userDocumentsId: string, status: string, url: string): Promise<void>;
  countRequiredDocs(userId: string): Promise<RequiredDocsCount>;
}

export const USER_DOCUMENTS_REPOSITORY = Symbol('USER_DOCUMENTS_REPOSITORY');
