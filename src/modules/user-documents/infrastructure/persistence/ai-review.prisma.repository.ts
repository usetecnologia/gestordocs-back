import { Injectable } from '@nestjs/common';
import type { Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import type { ParticipantRegistry } from '@modules/document/domain/ai/passport-review-decision';
import type {
  AiReviewDecision,
  AiReviewItem,
  AiReviewTarget,
  IAiReviewRepository,
  SaveAiReviewData,
} from '../../domain/ai-review.repository';

@Injectable()
export class AiReviewPrismaRepository implements IAiReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTarget(userDocumentId: string): Promise<AiReviewTarget | null> {
    const aiConfig = { select: { aiEnabled: true, aiInstructions: true } } as const;
    const row = await this.prisma.userDocuments.findUnique({
      where: { id: userDocumentId },
      select: {
        id: true,
        userId: true,
        documents: aiConfig,
        documentSponsors: { select: { document: aiConfig } },
      },
    });
    if (!row) return null;
    // Un documento ligado a un sponsor hereda la configuración del documento base.
    const config = row.documents ?? row.documentSponsors?.document ?? null;
    return {
      userDocumentId: row.id,
      userId: row.userId,
      aiEnabled: config?.aiEnabled ?? false,
      aiInstructions: config?.aiInstructions ?? null,
    };
  }

  async findParticipantRegistry(userId: string): Promise<ParticipantRegistry | null> {
    const person = await this.prisma.person.findUnique({
      where: { id: userId },
      select: { dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true, birthdate: true },
    });
    if (!person) return null;
    return {
      dni: person.dni,
      nombres: [person.firstname, person.middlename].filter(Boolean).join(' '),
      apellidos: [person.lastfathername, person.lastmothername].filter(Boolean).join(' '),
      nacimiento: person.birthdate,
    };
  }

  async findUserIdByUsername(username: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({ where: { username }, select: { id: true } });
    return user?.id ?? null;
  }

  async findEtiquetaIdByName(name: string): Promise<string | null> {
    const etiqueta = await this.prisma.etiquetas.findFirst({ where: { name, status: true }, select: { id: true } });
    return etiqueta?.id ?? null;
  }

  async save(data: SaveAiReviewData): Promise<void> {
    await this.prisma.userDocumentAiReview.create({
      data: {
        userDocumentsId: data.userDocumentId,
        decision: data.decision,
        motivo: data.motivo,
        observacion: data.observacion,
        fileUrl: data.fileUrl,
        // JSON.stringify/parse deja solo datos serializables (sin Date ni undefined) para la columna JSON.
        resultado: data.resultado === null ? undefined : (JSON.parse(JSON.stringify(data.resultado)) as Prisma.InputJsonValue),
        modelo: data.modelo,
        duracionMs: data.duracionMs,
      },
    });
  }

  async findLatestByUserId(userId: string): Promise<AiReviewItem[]> {
    const rows = await this.prisma.userDocumentAiReview.findMany({
      where: { userDocuments: { userId } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userDocumentsId: true, decision: true, motivo: true, observacion: true, createdAt: true },
    });
    const latest = new Map<string, AiReviewItem>();
    for (const r of rows) {
      if (latest.has(r.userDocumentsId)) continue;
      latest.set(r.userDocumentsId, {
        id: r.id,
        userDocumentId: r.userDocumentsId,
        decision: r.decision as AiReviewDecision,
        motivo: r.motivo,
        observacion: r.observacion,
        createdAt: r.createdAt,
      });
    }
    return [...latest.values()];
  }
}
