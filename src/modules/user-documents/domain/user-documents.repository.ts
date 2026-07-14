export interface ExistingUserDocument {
  id: string;
  userId: string;
  documentSponsorId: string | null;
  documentId: string | null;
  status: string;
  statusDocument: boolean;
  updatedAt: Date;
}

export interface CloneDocumentForSponsorData {
  userId: string;
  documentSponsorId: string;
  status: string;
  url: string | null;
}

export interface RefreshDocumentFromLatestData {
  userDocumentId: string;
  status: string;
  url: string | null;
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
  files: { id: string; file: string }[];
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
  order: number | null;
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
  files?: string[];
}

export enum UserDocumentFilter {
  ALL = 'ALL',
  REQUIRED = 'REQUIRED',
  OBSERVED = 'OBSERVED',
}

export interface BulkUploadFileData {
  userId: string;
  documentId: string | null;
  documentSponsorId: string | null;
  status: string;
  url: string;
  createdById: string;
}

export type DocumentTargetResult =
  | { found: false }
  | { found: true; applicable: false }
  | { found: true; applicable: true; documentId: string | null; documentSponsorId: string | null };

export interface ActiveUserDocumentStatus {
  userId: string;
  documentId: string | null;
  documentSponsorId: string | null;
  status: string;
}

export interface ParticipantSponsorInfo {
  id: string;
  dni: string | null;
  firstname: string;
  middlename: string | null;
  lastfathername: string;
  lastmothername: string | null;
  sponsorCode: string | null;
}

export interface UserEmailContext {
  email: string | null;
  nombreParticipante: string;
  nombrePrograma: string;
  nombreSponsor: string;
}

export interface UserDocumentTargetHistoryItem {
  status: string;
  url: string | null;
  createdAt: Date;
}

export interface IUserDocumentsRepository {
  findByUserId(userId: string): Promise<ExistingUserDocument[]>;
  findUserSponsorCode(userId: string): Promise<string | null>;
  findByUserIdWithHistory(userId: string, filter?: UserDocumentFilter): Promise<UserDocumentWithHistory[]>;
  findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null>;
  createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void>;
  cloneDocumentForNewSponsor(data: CloneDocumentForSponsorData): Promise<void>;
  refreshDocumentFromLatest(data: RefreshDocumentFromLatestData): Promise<void>;
  updateStatusDocument(id: string, statusDocument: boolean): Promise<void>;
  addHistory(userDocumentsId: string, status: string, url: string, createdById: string): Promise<void>;
  countRequiredDocs(userId: string): Promise<RequiredDocsCount>;
  aceptarDocument(data: AceptarDocumentData): Promise<void>;
  observarDocument(data: ObservarDocumentData): Promise<void>;
  findUserIdByDni(dni: string): Promise<string | null>;
  findDocumentTargetBySiglasCode(siglasCode: string, sponsorCode: string | null): Promise<DocumentTargetResult>;
  upsertUserDocumentWithStatus(data: BulkUploadFileData): Promise<void>;
  findActiveStatusesByUserIds(userIds: string[]): Promise<ActiveUserDocumentStatus[]>;
  hasObservedDocument(userId: string): Promise<boolean>;
  findParticipantInfo(userId: string): Promise<ParticipantSponsorInfo | null>;
  findEmailContextByUserId(userId: string): Promise<UserEmailContext | null>;
  findParticipantInfoByDni(dni: string): Promise<ParticipantSponsorInfo | null>;
  findAllParticipantIds(): Promise<string[]>;
  findHistoryByUserAndTarget(
    userId: string,
    documentId: string | null,
    documentSponsorId: string | null,
  ): Promise<UserDocumentTargetHistoryItem[]>;
  findUserDocumentIdForTarget(
    userId: string,
    documentId: string,
    sponsorId: string | null,
  ): Promise<string | null>;
}

export const USER_DOCUMENTS_REPOSITORY = Symbol('USER_DOCUMENTS_REPOSITORY');
