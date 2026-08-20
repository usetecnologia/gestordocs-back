import type { Prisma } from 'prisma/generated/prisma/client';
import {
  Document,
  DocumentProgramDescriptionItem,
  DocumentProgramItem,
  DocumentSponsorItem,
} from '../../domain/document.entity';
import { TypeDocument, TypeHired } from '../../domain/document.enums';

export const DOCUMENT_FULL_INCLUDE = {
  createdBy: { select: { id: true, username: true, email: true } },
  updatedBy: { select: { id: true, username: true, email: true } },
  documentSponsors: {
    include: { sponsor: { select: { id: true, name: true, code: true } } },
    orderBy: { order: 'asc' as const },
  },
  documentPrograms: {
    include: {
      program: { select: { id: true, name: true, code: true } },
      // Sin filtrar por status: una temporada desactivada despues de haberse asignado tiene
      // que seguir viajando al formulario, o el primer guardado la borraria sin avisar.
      temporada: { select: { id: true, name: true, status: true } },
      descriptions: {
        include: {
          countries: {
            include: { country: { select: { id: true, name: true, code: true } } },
          },
        },
        orderBy: { order: 'asc' as const },
      },
    },
  },
} satisfies Prisma.DocumentsInclude;

export type PrismaDocumentFull = Prisma.DocumentsGetPayload<{
  include: typeof DOCUMENT_FULL_INCLUDE;
}>;

export class DocumentMapper {
  static toDomain(raw: PrismaDocumentFull): Document {
    const sponsors: DocumentSponsorItem[] = raw.documentSponsors.map((ds) => ({
      id: ds.id,
      sponsorId: ds.sponsorId,
      sponsor: ds.sponsor,
      required: ds.required,
      order: ds.order,
      status: ds.status,
    }));

    const programs: DocumentProgramItem[] = raw.documentPrograms.map((dp) => {
      const descriptions: DocumentProgramDescriptionItem[] = dp.descriptions.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        order: d.order,
        countries: d.countries.map((c) => ({
          id: c.id,
          countryId: c.countryId,
          country: c.country,
        })),
      }));

      return {
        id: dp.id,
        programId: dp.programId,
        program: dp.program,
        temporadaId: dp.temporadaId,
        temporada: dp.temporada,
        status: dp.status,
        descriptions,
      };
    });

    return new Document(
      raw.id,
      raw.title,
      raw.name,
      raw.type as unknown as TypeDocument,
      raw.formats,
      raw.showHired as unknown as TypeHired,
      raw.siglasCode,
      raw.order,
      raw.instructions,
      raw.required,
      raw.status,
      raw.createdById,
      raw.updatedById,
      raw.createdAt,
      raw.updatedAt,
      sponsors,
      programs,
      raw.createdBy,
      raw.updatedBy,
    );
  }
}
