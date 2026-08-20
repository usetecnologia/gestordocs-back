import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import type { Prisma } from 'prisma/generated/prisma/client';
import {
  IDocumentRepository,
  DocumentFilters,
  CreateDocumentData,
  UpdateDocumentData,
  DocumentProgramInputData,
  DocumentCountryItem,
  ParticipantDocumentFilter,
  TemporadaProgramRef,
} from '../../domain/document.repository';
import { Document } from '../../domain/document.entity';
import { TypeDocument } from '../../domain/document.enums';
import { DocumentMapper, DOCUMENT_FULL_INCLUDE, PrismaDocumentFull } from './document.mapper';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class DocumentPrismaRepository implements IDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async createPrograms(
    tx: TransactionClient,
    documentId: string,
    programs: DocumentProgramInputData[],
  ): Promise<void> {
    for (const p of programs) {
      const documentProgram = await tx.documentProgram.create({
        data: {
          documentId,
          programId: p.programId,
          temporadaId: p.temporadaId ?? null,
          status: p.status ?? true,
        },
      });

      const descriptions = p.descriptions ?? [];
      for (let index = 0; index < descriptions.length; index++) {
        const d = descriptions[index];
        const description = await tx.documentProgramDescription.create({
          data: {
            documentProgramId: documentProgram.id,
            title: d.title,
            description: d.description,
            order: index,
          },
        });

        if (d.countryIds.length > 0) {
          await tx.documentProgramDescriptionCountry.createMany({
            data: d.countryIds.map((countryId) => ({
              documentProgramDescriptionId: description.id,
              documentProgramId: documentProgram.id,
              countryId,
            })),
          });
        }
      }
    }
  }

  private async replacePrograms(
    tx: TransactionClient,
    documentId: string,
    programs: DocumentProgramInputData[],
  ): Promise<void> {
    // Sin historial de usuario dependiendo de este vínculo (a diferencia de DocumentSponsor),
    // se reemplaza por completo en cada actualización: más simple que un diff y sin riesgo.
    const existingPrograms = await tx.documentProgram.findMany({
      where: { documentId },
      select: { id: true },
    });
    const existingProgramIds = existingPrograms.map((p) => p.id);

    if (existingProgramIds.length > 0) {
      const existingDescriptions = await tx.documentProgramDescription.findMany({
        where: { documentProgramId: { in: existingProgramIds } },
        select: { id: true },
      });
      const existingDescriptionIds = existingDescriptions.map((d) => d.id);

      if (existingDescriptionIds.length > 0) {
        await tx.documentProgramDescriptionCountry.deleteMany({
          where: { documentProgramDescriptionId: { in: existingDescriptionIds } },
        });
        await tx.documentProgramDescription.deleteMany({
          where: { id: { in: existingDescriptionIds } },
        });
      }

      await tx.documentProgram.deleteMany({ where: { id: { in: existingProgramIds } } });
    }

    if (programs.length > 0) {
      await this.createPrograms(tx, documentId, programs);
    }
  }

  async findAll({
    page,
    limit,
    type,
    showHired,
    status,
    search,
    sponsorId,
    programId,
    countryId,
  }: DocumentFilters): Promise<{
    data: Document[];
    total: number;
  }> {
    const where: Prisma.DocumentsWhereInput = {
      ...(type && { type }),
      ...(showHired && { showHired }),
      ...(status !== undefined && { status }),
      // El buscador acepta tanto el nombre como las siglas: en la tabla el documento se reconoce
      // por su badge de siglas, así que escribir "DNI" tiene que encontrarlo igual que "Documento
      // Nacional de Identidad".
      ...(search && {
        OR: [{ name: { contains: search } }, { siglasCode: { contains: search } }],
      }),
      // Los tres filtros del catálogo coinciden con lo que la tabla muestra en sus columnas, no
      // con la regla de aplicabilidad del participante. En particular NO se aplica aquí el
      // "sin vínculos de sponsor = aplica a todos": filtrar por un sponsor y recibir además
      // todos los documentos generales (que la columna Sponsors muestra como "—") se leería
      // como que el filtro no hizo nada.
      ...(sponsorId && { documentSponsors: { some: { sponsorId } } }),
      // Programa y país comparten la relación `documentPrograms`. Se combinan en un `AND` de dos
      // `some` independientes y no en un solo `some`, para que país y programa puedan venir de
      // vínculos distintos: un documento en (WAT USA, Perú) y (Internship USA, Argentina) sale
      // al filtrar por WAT USA y también al filtrar por Argentina, que es lo que muestran las
      // columnas. Exigirlos en el mismo vínculo sería un filtro combinado distinto.
      ...((programId || countryId) && {
        AND: [
          ...(programId ? [{ documentPrograms: { some: { programId } } }] : []),
          ...(countryId
            ? [
                {
                  documentPrograms: {
                    some: { descriptions: { some: { countries: { some: { countryId } } } } },
                  },
                },
              ]
            : []),
        ],
      }),
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
    // Solo vínculos documentSponsor activos cuentan para el sync del participante — los
    // desactivados (status: false) son sponsors retirados y deben ignorarse aquí.
    const rows = await this.prisma.documents.findMany({
      where: {
        OR: [
          { documentSponsors: { some: { sponsor: { code: sponsorCode }, status: true } } },
          { documentSponsors: { none: { status: true } } },
        ],
      },
      include: {
        ...DOCUMENT_FULL_INCLUDE,
        documentSponsors: {
          where: { status: true },
          include: { sponsor: { select: { id: true, name: true, code: true } } },
          orderBy: { order: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return (rows as PrismaDocumentFull[]).map(DocumentMapper.toDomain);
  }

  async findApplicableForParticipant({
    sponsorCode,
    programId,
    countryId,
  }: ParticipantDocumentFilter): Promise<Document[]> {
    // Programa y país son dimensiones ESTRICTAS: un documento se le pide al participante solo
    // si está asociado explícitamente a su programa Y tiene, dentro de ese programa, una
    // descripción configurada para su país. A diferencia del sponsor, aquí NO aplica la regla
    // "sin vínculos = aplica a todos" — un documento sin programas no le corresponde a nadie, y
    // un programa o país nuevo no hereda documentos hasta que alguien los configure. Es
    // deliberado: evita que un catálogo a medio configurar genere expedientes con data mala.
    // Corolario: sin programa o sin país, el participante no recibe ningún documento.
    if (!programId || !countryId) return [];

    const rows = await this.prisma.documents.findMany({
      where: {
        documentPrograms: {
          some: {
            programId,
            status: true,
            descriptions: { some: { countries: { some: { countryId } } } },
          },
        },
        // El sponsor conserva su regla histórica: el vínculo del sponsor del participante, o
        // ningún vínculo activo (documento general).
        OR: [
          { documentSponsors: { some: { sponsor: { code: sponsorCode ?? '' }, status: true } } },
          { documentSponsors: { none: { status: true } } },
        ],
      },
      include: {
        ...DOCUMENT_FULL_INCLUDE,
        documentSponsors: {
          where: { status: true },
          include: { sponsor: { select: { id: true, name: true, code: true } } },
          orderBy: { order: 'asc' as const },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return (rows as PrismaDocumentFull[]).map(DocumentMapper.toDomain);
  }

  async findInformativeBySponsorIds(sponsorIds: string[]): Promise<Document[]> {
    // Mismo criterio que findBySponsorCode: solo vínculos documentSponsor activos cuentan,
    // y un documento sin ningún vínculo activo se considera general (visible a todos).
    const rows = await this.prisma.documents.findMany({
      where: {
        type: TypeDocument.INFORMATIVE,
        OR: [
          { documentSponsors: { some: { sponsorId: { in: sponsorIds }, status: true } } },
          { documentSponsors: { none: { status: true } } },
        ],
      },
      include: {
        ...DOCUMENT_FULL_INCLUDE,
        documentSponsors: {
          where: { status: true },
          include: { sponsor: { select: { id: true, name: true, code: true } } },
          orderBy: { order: 'asc' as const },
        },
      },
      orderBy: [{ order: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
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

  async findCountriesByDocumentId(documentId: string): Promise<DocumentCountryItem[]> {
    const rows = await this.prisma.documentProgramDescriptionCountry.findMany({
      where: { documentProgram: { documentId } },
      distinct: ['countryId'],
      include: { country: { select: { id: true, code: true, name: true } } },
    });
    return rows.map((r) => r.country);
  }

  async findTemporadaRefs(temporadaIds: string[]): Promise<TemporadaProgramRef[]> {
    if (temporadaIds.length === 0) return [];
    return this.prisma.temporada.findMany({
      where: { id: { in: temporadaIds } },
      select: { id: true, programId: true },
    });
  }

  async create(data: CreateDocumentData): Promise<Document> {
    const { sponsors, programs, createdById, ...fields } = data;

    const documentId = await this.prisma.$transaction(async (tx) => {
      const row = await tx.documents.create({
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
      });

      if (programs?.length) {
        await this.createPrograms(tx, row.id, programs);
      }

      return row.id;
    });

    return (await this.findById(documentId))!;
  }

  async update(id: string, data: UpdateDocumentData): Promise<Document> {
    const { sponsors, programs, updatedById, ...fields } = data;

    await this.prisma.$transaction(async (tx) => {
      await tx.documents.update({
        where: { id },
        data: {
          ...fields,
          ...(updatedById !== undefined && { updatedById }),
        },
      });

      if (programs !== undefined) {
        await this.replacePrograms(tx, id, programs);
      }

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
            : (await tx.documentSponsor.count({ where: { documentId: id, status: true } })) > 0;

        if (!willHaveSponsors || fields.status === false) {
          await tx.userDocuments.updateMany({
            where: { documentId: id, documentSponsorId: null },
            data: { statusDocument: fields.status },
          });
        }
      }

      if (sponsors !== undefined) {
        // Sincroniza por diff — NUNCA se borra un DocumentSponsor existente. Recrearlo con
        // un id nuevo huerfanaría (y en cascada borraría) el historial de todos los usuarios
        // que ya tenían progreso bajo ese vínculo, aunque el sponsor no haya cambiado
        // realmente. En su lugar: se actualiza el vínculo que sigue vigente, se crea el que
        // es nuevo, y el que se retira se desactiva (status: false) conservando su historial.
        const existingSponsors = await tx.documentSponsor.findMany({
          where: { documentId: id },
          select: { id: true, sponsorId: true, status: true },
        });
        const existingBySponsorId = new Map(existingSponsors.map((ds) => [ds.sponsorId, ds]));
        const incomingSponsorIds = new Set(sponsors.map((s) => s.sponsorId));

        // Cuando el documento pasa a ser sponsor-específico, desactivar los registros
        // userDocuments creados en el camino "visible a todos" (documentId sin documentSponsorId).
        // El sync en el próximo autologin re-activará solo los usuarios con el sponsor correcto.
        if (sponsors.length > 0) {
          await tx.userDocuments.updateMany({
            where: { documentId: id, documentSponsorId: null },
            data: { statusDocument: false },
          });
        }

        for (const s of sponsors) {
          const existing = existingBySponsorId.get(s.sponsorId);
          if (existing) {
            await tx.documentSponsor.update({
              where: { id: existing.id },
              data: {
                required: s.required ?? false,
                order: s.order,
                status: true,
                ...(updatedById && { updatedById }),
              },
            });
          } else {
            await tx.documentSponsor.create({
              data: {
                documentId: id,
                sponsorId: s.sponsorId,
                required: s.required ?? false,
                order: s.order,
                ...(updatedById && { createdById: updatedById }),
              },
            });
          }
        }

        const removedSponsorIds = existingSponsors
          .filter((ds) => ds.status && !incomingSponsorIds.has(ds.sponsorId))
          .map((ds) => ds.id);

        if (removedSponsorIds.length > 0) {
          await tx.documentSponsor.updateMany({
            where: { id: { in: removedSponsorIds } },
            data: { status: false, ...(updatedById && { updatedById }) },
          });
          // Se desactiva (nunca se borra) el UserDocuments de los usuarios vinculados al
          // sponsor retirado — su historial se conserva íntegro.
          await tx.userDocuments.updateMany({
            where: { documentSponsorId: { in: removedSponsorIds } },
            data: { statusDocument: false },
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

      const documentPrograms = await tx.documentProgram.findMany({
        where: { documentId: id },
        select: { id: true },
      });
      const documentProgramIds = documentPrograms.map((dp) => dp.id);

      if (documentProgramIds.length > 0) {
        const descriptions = await tx.documentProgramDescription.findMany({
          where: { documentProgramId: { in: documentProgramIds } },
          select: { id: true },
        });
        const descriptionIds = descriptions.map((d) => d.id);

        if (descriptionIds.length > 0) {
          await tx.documentProgramDescriptionCountry.deleteMany({
            where: { documentProgramDescriptionId: { in: descriptionIds } },
          });
          await tx.documentProgramDescription.deleteMany({
            where: { id: { in: descriptionIds } },
          });
        }

        await tx.documentProgram.deleteMany({ where: { id: { in: documentProgramIds } } });
      }

      await tx.documents.delete({ where: { id } });
    });
  }
}
