export interface ExistingUserDocument {
  id: string;
  userId: string;
  documentSponsorId: string | null;
  documentId: string | null;
  status: string;
  statusDocument: boolean;
  updatedAt: Date;
}

export interface CreateUserDocumentWithHistoryData {
  userId: string;
  /**
   * Proceso al que pertenece el documento. Lo pasa quien crea, no lo adivina el repositorio: el
   * sync ya sabe en qué proceso está trabajando, y que el dato viaje explícito es lo que impide
   * que un documento termine colgado del proceso equivocado.
   */
  procesoId: string;
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
  instructions: string | null;
  required: boolean;
  order: number | null;
  /**
   * Título y descripción configurados para la combinación (programa del participante, país del
   * participante). El filtrado garantiza que todo documento visible tenga una descripción para
   * su país, así que vienen poblados; quedan nulos solo si se consultan fuera de ese flujo.
   */
  programTitle: string | null;
  programDescription: string | null;
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

/**
 * Datos del participante con los que se resuelve qué documentos le corresponden. Se cargan
 * dentro del sync (no se reciben por parámetro) para que todos los caminos que sincronizan
 * un expediente usen exactamente el mismo criterio.
 */
export interface UserApplicabilityContext {
  sponsorCode: string | null;
  programId: string | null;
  countryId: string | null;
}

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

export interface PassportDocumentCandidate {
  userId: string;
  userDocumentId: string;
  status: string;
  url: string;
  updatedAt: Date;
}

export interface IUserDocumentsRepository {
  /**
   * Expediente de UN proceso. El sync trabaja siempre dentro de un proceso: un ciclo nuevo no
   * hereda nada del anterior, así que mirar por `userId` mezclaría dos historias distintas.
   */
  findByProcesoId(procesoId: string): Promise<ExistingUserDocument[]>;
  findUserApplicabilityContext(userId: string): Promise<UserApplicabilityContext | null>;
  /**
   * `procesoId` acota el expediente a un ciclo concreto, para revisar uno archivado. Sin él se lee
   * el ciclo visible. Un id que no sea de ese participante devuelve vacío.
   */
  findByUserIdWithHistory(
    userId: string,
    filter?: UserDocumentFilter,
    procesoId?: string,
  ): Promise<UserDocumentWithHistory[]>;
  findByIdWithHistory(id: string): Promise<UserDocumentWithHistory | null>;
  createWithHistory(data: CreateUserDocumentWithHistoryData): Promise<void>;
  updateStatusDocument(id: string, statusDocument: boolean): Promise<void>;
  addHistory(userDocumentsId: string, status: string, url: string, createdById: string): Promise<void>;
  countRequiredDocs(userId: string): Promise<RequiredDocsCount>;
  aceptarDocument(data: AceptarDocumentData): Promise<void>;
  observarDocument(data: ObservarDocumentData): Promise<void>;
  findUserIdByDni(dni: string): Promise<string | null>;
  findDocumentTargetBySiglasCode(
    siglasCode: string,
    context: UserApplicabilityContext,
  ): Promise<DocumentTargetResult>;
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
  findAllPassportDocuments(): Promise<PassportDocumentCandidate[]>;
}

export const USER_DOCUMENTS_REPOSITORY = Symbol('USER_DOCUMENTS_REPOSITORY');
