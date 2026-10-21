import type { ParticipantRegistry } from '@modules/document/domain/ai/passport-review-decision';

export type AiReviewDecision = 'APROBADO' | 'OBSERVADO' | 'REVISION_MANUAL' | 'ERROR';

/** Documento subido y su configuración de IA (del documento directo o del documento del sponsor). */
export interface AiReviewTarget {
  userDocumentId: string;
  userId: string;
  aiEnabled: boolean;
  aiInstructions: string | null;
}

export interface SaveAiReviewData {
  userDocumentId: string;
  decision: AiReviewDecision;
  motivo: string;
  observacion: string | null;
  fileUrl: string | null;
  resultado: unknown;
  modelo: string | null;
  duracionMs: number | null;
}

export interface AiReviewItem {
  id: string;
  userDocumentId: string;
  decision: AiReviewDecision;
  motivo: string;
  observacion: string | null;
  createdAt: Date;
}

export interface IAiReviewRepository {
  findTarget(userDocumentId: string): Promise<AiReviewTarget | null>;
  /** Datos que el participante registró (Person comparte el id con User). */
  findParticipantRegistry(userId: string): Promise<ParticipantRegistry | null>;
  findUserIdByUsername(username: string): Promise<string | null>;
  findEtiquetaIdByName(name: string): Promise<string | null>;
  save(data: SaveAiReviewData): Promise<void>;
  /** La revisión más reciente de cada documento del participante. */
  findLatestByUserId(userId: string): Promise<AiReviewItem[]>;
}

export const AI_REVIEW_REPOSITORY = Symbol('AI_REVIEW_REPOSITORY');
