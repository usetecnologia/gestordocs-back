import { Inject, Injectable, Logger } from '@nestjs/common';
import { detectFileType } from '@common/utils/file-type.util';
import { envs } from '@config/envs';
import {
  DOCUMENT_AI_EXTRACTOR_PORT,
  IDocumentAiExtractorPort,
} from '@modules/document/domain/ai/document-ai-extractor.port';
import { buildPassportExtractionReport } from '@modules/document/domain/ai/passport-extraction-report';
import { decidePassportReview } from '@modules/document/domain/ai/passport-review-decision';
import {
  AI_REVIEW_REPOSITORY,
  AiReviewDecision,
  IAiReviewRepository,
} from '../../domain/ai-review.repository';
import { AI_OBSERVATION_LABEL_NAME, AI_REVIEWER_USERNAME } from '../../domain/ai-review.constants';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';
import { AceptarDocumentUseCase } from './aceptar-document.use-case';
import { TerminarRevisionUseCase } from './terminar-revision.use-case';

const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Estados del participante en los que la IA puede revisar. Fuera de ellos (EN_REVISION, ya en
 * preparación, enviado al sponsor...) hay una persona trabajando el expediente o ya no corresponde.
 */
const REVIEWABLE_STATUSES = new Set([
  'SIN_DOCUMENTOS',
  'DOCUMENTOS_SUBIDOS',
  'DOCUMENTOS_INCOMPLETOS',
  'PENDIENTE_REVISAR',
  'OBSERVADO',
]);

export interface AiReviewInput {
  userDocumentId: string;
  file: { buffer: Buffer; originalname: string };
  fileUrl: string;
}

/**
 * Revisión automática de un documento recién subido por el participante, con el mismo flujo que
 * un revisor: comenzar revisión (EN_REVISION) → aprobar u observar → terminar revisión.
 *
 * Solo actúa sobre documentos con la IA activada. Si el resultado no es claro, no aprueba ni
 * observa: deja el documento SUBIDO para un revisor y guarda lo que encontró la IA.
 */
@Injectable()
export class AiReviewUploadedDocumentUseCase {
  private readonly logger = new Logger(AiReviewUploadedDocumentUseCase.name);
  /** Evita dos revisiones simultáneas del mismo participante (la API corre en una sola instancia). */
  private readonly inProgress = new Set<string>();

  constructor(
    @Inject(AI_REVIEW_REPOSITORY) private readonly aiReviewRepo: IAiReviewRepository,
    @Inject(USER_DOCUMENTS_REPOSITORY) private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT) private readonly userStatusPort: IUserStatusPort,
    @Inject(DOCUMENT_AI_EXTRACTOR_PORT) private readonly extractor: IDocumentAiExtractorPort,
    private readonly aceptarDocument: AceptarDocumentUseCase,
    private readonly terminarRevision: TerminarRevisionUseCase,
  ) {}

  /** Lanza la revisión sin bloquear la respuesta de la subida. Nunca lanza errores hacia afuera. */
  schedule(input: AiReviewInput): void {
    setImmediate(() => {
      this.execute(input).catch((err: unknown) => {
        this.logger.error(
          `Revisión IA del documento ${input.userDocumentId} falló: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    });
  }

  async execute(input: AiReviewInput): Promise<void> {
    const target = await this.aiReviewRepo.findTarget(input.userDocumentId);
    if (!target?.aiEnabled) return;

    const aiUserId = await this.aiReviewRepo.findUserIdByUsername(AI_REVIEWER_USERNAME);
    if (!aiUserId) {
      this.logger.warn(
        `No existe el usuario "${AI_REVIEWER_USERNAME}": la revisión IA está desactivada. Créalo con npm run seed:ai-reviewer.`,
      );
      return;
    }

    const status = await this.userStatusPort.getStatus(target.userId);
    if (!status || !REVIEWABLE_STATUSES.has(status) || this.inProgress.has(target.userId)) {
      this.logger.log(`Revisión IA omitida para ${target.userId}: estado ${status ?? 'desconocido'}.`);
      return;
    }

    this.inProgress.add(target.userId);
    try {
      // 1. Comenzar revisión, igual que un revisor.
      await this.userStatusPort.updateStatus(target.userId, 'EN_REVISION', aiUserId);
      try {
        await this.review(input, target.userId, target.aiInstructions, aiUserId);
      } finally {
        // 3. Terminar revisión SIEMPRE, aunque la IA falle: si no, el participante quedaría
        // EN_REVISION y bloqueado. Sin correo al participante, por decisión de negocio.
        await this.terminarRevision.execute(target.userId, aiUserId, true);
      }
    } finally {
      this.inProgress.delete(target.userId);
    }
  }

  /** 2. Leer, comparar con el registro y aprobar u observar (o dejarlo para un revisor). */
  private async review(
    input: AiReviewInput,
    userId: string,
    instructions: string | null,
    aiUserId: string,
  ): Promise<void> {
    const startedAt = Date.now();
    const save = (decision: AiReviewDecision, motivo: string, extra: { observacion?: string | null; resultado?: unknown } = {}) =>
      this.aiReviewRepo.save({
        userDocumentId: input.userDocumentId,
        decision,
        motivo,
        observacion: extra.observacion ?? null,
        fileUrl: input.fileUrl,
        resultado: extra.resultado ?? null,
        modelo: envs.OPENAI_PASSPORT_MODEL,
        duracionMs: Date.now() - startedAt,
      });

    try {
      const detected = detectFileType(input.file.buffer);
      if (!detected || !SUPPORTED_CONTENT_TYPES.includes(detected.contentType)) {
        await save('REVISION_MANUAL', 'Formato de archivo que la IA no puede leer: lo revisa una persona.');
        return;
      }

      const registry = await this.aiReviewRepo.findParticipantRegistry(userId);
      if (!registry) {
        await save('REVISION_MANUAL', 'El participante no tiene datos registrados con los que comparar.');
        return;
      }

      const { extraction, preparacion } = await this.extractor.extractPassport(
        { buffer: input.file.buffer, contentType: detected.contentType, filename: input.file.originalname },
        instructions,
      );
      const report = buildPassportExtractionReport(extraction);
      const result = decidePassportReview(extraction, report, registry);
      const resultado = { reporte: report, decision: result, preparacion };

      if (result.decision === 'APROBAR') {
        await this.aceptarDocument.execute(input.userDocumentId, aiUserId);
        await save('APROBADO', result.motivos.join(' '), { resultado });
        return;
      }

      if (result.decision === 'OBSERVAR' && result.observacion) {
        const labelId = await this.aiReviewRepo.findEtiquetaIdByName(AI_OBSERVATION_LABEL_NAME);
        if (!labelId) this.logger.warn(`No existe la etiqueta "${AI_OBSERVATION_LABEL_NAME}"; se observa sin etiqueta.`);
        await this.userDocumentsRepo.observarDocument({
          userDocumentId: input.userDocumentId,
          observation: result.observacion,
          etiquetaIds: labelId ? [labelId] : [],
          reviewedById: aiUserId,
          url: input.fileUrl,
        });
        await save('OBSERVADO', result.motivos.join(' '), { observacion: result.observacion, resultado });
        return;
      }

      await save('REVISION_MANUAL', result.motivos.join(' '), { resultado });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Revisión IA del documento ${input.userDocumentId}: ${message}`);
      await save('ERROR', `La IA no pudo revisar el documento: ${message}. Lo revisa una persona.`);
    }
  }
}
