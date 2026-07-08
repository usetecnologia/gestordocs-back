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
        orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      }),
      this.prisma.documents.count({ where }),
    ]);

    return { data: (data as PrismaDocumentFull[]).map(DocumentMapper.toDomain), total };
  }

  async findAllActive(): Promise<Document[]> {
    const rows = await this.prisma.documents.findMany({
      where: { status: true },
      include: DOCUMENT_FULL_INCLUDE,
      orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return (rows as PrismaDocumentFull[]).map(DocumentMapper.toDomain);
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
              await tx.userDocumentObservationFiles.deleteMany({
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
    const found = await this.prisma.$transaction(async (tx) => {
      // FOR UPDATE bloquea la fila hasta que la transacción termine: si llegan dos
      // peticiones concurrentes para el mismo documento, la segunda espera a que la
      // primera confirme y recién ahí lee el `order` ya actualizado (evita leer un
      // valor viejo y desplazar a los demás documentos por duplicado).
      const rows = await tx.$queryRaw<Array<{ order: number | null }>>`
        SELECT \`order\` FROM \`documents\` WHERE \`id\` = ${id} FOR UPDATE
      `;
      if (rows.length === 0) return false;

      const oldOrder = rows[0].order;

      if (order === oldOrder) {
        // No hay cambio real de posición; no se desplaza a nadie más.
      } else if (order === null) {
        if (oldOrder !== null) {
          await tx.documents.updateMany({
            where: { order: { gt: oldOrder } },
            data: { order: { decrement: 1 } },
          });
        }
      } else if (oldOrder === null) {
        // El documento entra a la lista ordenada: todo lo que esté desde `order` en
        // adelante retrocede un puesto para abrir espacio.
        await tx.documents.updateMany({
          where: { id: { not: id }, order: { gte: order } },
          data: { order: { increment: 1 } },
        });
      } else if (order > oldOrder) {
        // Se mueve hacia abajo: lo que estaba entre (oldOrder, order] sube un puesto.
        await tx.documents.updateMany({
          where: { id: { not: id }, order: { gt: oldOrder, lte: order } },
          data: { order: { decrement: 1 } },
        });
      } else {
        // Se mueve hacia arriba: lo que estaba entre [order, oldOrder) baja un puesto.
        await tx.documents.updateMany({
          where: { id: { not: id }, order: { gte: order, lt: oldOrder } },
          data: { order: { increment: 1 } },
        });
      }

      await tx.documents.update({ where: { id }, data: { order } });
      return true;
    });

    if (!found) return null;

    return this.findById(id);
  }

  async normalizeOrder(): Promise<Document[]> {
    const documents = await this.prisma.documents.findMany({
      select: { id: true },
      orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    await this.prisma.$transaction(
      documents.map((doc, index) =>
        this.prisma.documents.update({
          where: { id: doc.id },
          data: { order: index + 1 },
        }),
      ),
    );

    const rows = await this.prisma.documents.findMany({
      include: DOCUMENT_FULL_INCLUDE,
      orderBy: { order: 'asc' },
    });
    return (rows as PrismaDocumentFull[]).map(DocumentMapper.toDomain);
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
          await tx.userDocumentObservationFiles.deleteMany({
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
