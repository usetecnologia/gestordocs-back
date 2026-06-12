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
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.documents.count({ where }),
    ]);

    return { data: (data as PrismaDocumentFull[]).map(DocumentMapper.toDomain), total };
  }

  async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.documents.findUnique({
      where: { id },
      include: DOCUMENT_FULL_INCLUDE,
    });
    return row ? DocumentMapper.toDomain(row as PrismaDocumentFull) : null;
  }

  async create(data: CreateDocumentData): Promise<Document> {
    const { sponsorIds, createdById, ...fields } = data;

    const row = await this.prisma.documents.create({
      data: {
        ...fields,
        ...(createdById && { createdById }),
        ...(sponsorIds?.length && {
          documentSponsors: {
            create: sponsorIds.map((sponsorId) => ({
              sponsorId,
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
    const { sponsorIds, updatedById, ...fields } = data;

    await this.prisma.$transaction(async (tx) => {
      await tx.documents.update({
        where: { id },
        data: {
          ...fields,
          ...(updatedById !== undefined && { updatedById }),
        },
      });

      if (sponsorIds !== undefined) {
        await tx.documentSponsor.deleteMany({ where: { documentId: id } });

        if (sponsorIds.length > 0) {
          await tx.documentSponsor.createMany({
            data: sponsorIds.map((sponsorId) => ({
              documentId: id,
              sponsorId,
              ...(updatedById && { createdById: updatedById }),
            })),
          });
        }
      }
    });

    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.documentSponsor.deleteMany({ where: { documentId: id } }),
      this.prisma.documents.delete({ where: { id } }),
    ]);
  }
}
