import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IDocumentRepository,
  DocumentFilters,
  CreateDocumentData,
  UpdateDocumentData,
} from '../../domain/document.repository';
import { Document } from '../../domain/document.entity';
import { DocumentMapper, DOCUMENT_FULL_INCLUDE, PrismaDocumentFull } from './document.mapper';

@Injectable()
export class DocumentPrismaRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, type, showHired, status, search }: DocumentFilters): Promise<{
    data: Document[];
    total: number;
  }> {
    const where = {
      ...(type && { type }),
      ...(showHired && { showHired }),
      ...(status !== undefined && { status }),
      ...(search && { name: { contains: search } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.documents.findMany({
        where,
        include: DOCUMENT_FULL_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.documents.count({ where }),
    ]);

    return { data: (data as PrismaDocumentFull[]).map(DocumentMapper.toDomain), total };
  }

  async findBySponsorCode(sponsorCode: string): Promise<Document[]> {
    const rows = await this.prisma.documents.findMany({
      where: {
        OR: [
          { documentSponsors: { some: { sponsor: { code: sponsorCode } } } },
          { documentSponsors: { none: {} } },
        ],
      },
      include: DOCUMENT_FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return (rows as PrismaDocumentFull[]).map(DocumentMapper.toDomain);
  }

  async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.documents.findUnique({
      where: { id },
      include: DOCUMENT_FULL_INCLUDE,
    });
    return row ? DocumentMapper.toDomain(row as PrismaDocumentFull) : null;
  }

  async create(data: CreateDocumentData): Promise<Document> {
    const { sponsors, createdById, ...fields } = data;

    const row = await this.prisma.documents.create({
      data: {
        ...fields,
        ...(createdById && { createdById }),
        ...(sponsors?.length && {
          documentSponsors: {
            create: sponsors.map(({ sponsorId, required, order }) => ({
              sponsorId,
              required: required ?? false,
              order,
              ...(createdById && { createdById }),
            })),
          },
        }),
      },
      include: DOCUMENT_FULL_INCLUDE,
    });

    return DocumentMapper.toDomain(row as PrismaDocumentFull);
  }

  async update(id: string, data: UpdateDocumentData): Promise<Document> {
    const { sponsors, updatedById, ...fields } = data;

    await this.prisma.$transaction(async (tx) => {
      await tx.documents.update({
        where: { id },
        data: {
          ...fields,
          ...(updatedById !== undefined && { updatedById }),
        },
      });

      if (fields.status !== undefined) {
        // Siempre sincronizar registros vinculados vía documentSponsorId (sponsor-específicos)
        await tx.userDocuments.updateMany({
          where: { documentSponsors: { documentId: id } },
          data: { statusDocument: fields.status },
        });

        // Para registros vinculados solo por documentId (camino "visible a todos"):
        // - Al deshabilitar: siempre desactivar
        // - Al habilitar: solo si el documento no tendrá sponsors después de esta operación.
        //   Si tiene sponsors, esos registros deben permanecer desactivados para que
        //   usuarios sin el sponsor correcto no vean el documento.
        const willHaveSponsors =
          sponsors !== undefined
            ? sponsors.length > 0
            : (await tx.documentSponsor.count({ where: { documentId: id } })) > 0;

        if (!willHaveSponsors || fields.status === false) {
          await tx.userDocuments.updateMany({
            where: { documentId: id, documentSponsorId: null },
            data: { statusDocument: fields.status },
          });
        }
      }

      if (sponsors !== undefined) {
        const existingSponsors = await tx.documentSponsor.findMany({
          where: { documentId: id },
          select: { id: true },
        });
        const existingSponsorIds = existingSponsors.map((ds) => ds.id);

        // Cuando el documento pasa a ser sponsor-específico, desactivar los registros
        // userDocuments creados en el camino "visible a todos" (documentId sin documentSponsorId).
        // El sync en el próximo autologin re-activará solo los usuarios con el sponsor correcto.
        if (sponsors.length > 0) {
          await tx.userDocuments.updateMany({
            where: { documentId: id, documentSponsorId: null },
            data: { statusDocument: false },
          });
        }

        if (existingSponsorIds.length > 0) {
          const userDocs = await tx.userDocuments.findMany({
            where: { documentSponsorId: { in: existingSponsorIds } },
            select: { id: true },
          });
          const userDocIds = userDocs.map((ud) => ud.id);

          if (userDocIds.length > 0) {
            const histories = await tx.userDocumentHistory.findMany({
              where: { userDocumentsId: { in: userDocIds } },
              select: { id: true },
            });
            const historyIds = histories.map((h) => h.id);

            if (historyIds.length > 0) {
              await tx.userDocumentHistoryEtiquetas.deleteMany({
                where: { userDocumentHistoryId: { in: historyIds } },
              });
              await tx.userDocumentHistory.deleteMany({
                where: { id: { in: historyIds } },
              });
            }

            await tx.userDocuments.deleteMany({ where: { id: { in: userDocIds } } });
          }
        }

        await tx.documentSponsor.deleteMany({ where: { documentId: id } });

        if (sponsors.length > 0) {
          await tx.documentSponsor.createMany({
            data: sponsors.map(({ sponsorId, required, order }) => ({
              documentId: id,
              sponsorId,
              required: required ?? false,
              order,
              ...(updatedById && { createdById: updatedById }),
            })),
          });
        }
      }
    });

    return (await this.findById(id))!;
  }

  async updateOrder(id: string, order: number | null): Promise<Document | null> {
    const affected: number = await this.prisma.$executeRaw`
      UPDATE \`documents\` SET \`order\` = ${order}, \`updated_at\` = NOW() WHERE \`id\` = ${id}
    `;
    if (affected === 0) return null;
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const documentSponsors = await tx.documentSponsor.findMany({
        where: { documentId: id },
        select: { id: true },
      });
      const documentSponsorIds = documentSponsors.map((ds) => ds.id);

      const userDocumentsWhere = {
        OR: [
          { documentId: id },
          ...(documentSponsorIds.length > 0
            ? [{ documentSponsorId: { in: documentSponsorIds } }]
            : []),
        ],
      };

      const userDocs = await tx.userDocuments.findMany({
        where: userDocumentsWhere,
        select: { id: true },
      });
      const userDocIds = userDocs.map((ud) => ud.id);

      if (userDocIds.length > 0) {
        const histories = await tx.userDocumentHistory.findMany({
          where: { userDocumentsId: { in: userDocIds } },
          select: { id: true },
        });
        const historyIds = histories.map((h) => h.id);

        if (historyIds.length > 0) {
          await tx.userDocumentHistoryEtiquetas.deleteMany({
            where: { userDocumentHistoryId: { in: historyIds } },
          });
          await tx.userDocumentHistory.deleteMany({
            where: { id: { in: historyIds } },
          });
        }

        await tx.userDocuments.deleteMany({ where: { id: { in: userDocIds } } });
      }

      await tx.documentSponsor.deleteMany({ where: { documentId: id } });
      await tx.documents.delete({ where: { id } });
    });
  }
}
