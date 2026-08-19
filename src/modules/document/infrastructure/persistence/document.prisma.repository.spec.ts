import type { Prisma } from 'prisma/generated/prisma/client';
import type { PrismaService } from '@shared/prisma/prisma.service';
import { DocumentPrismaRepository } from './document.prisma.repository';

/**
 * Los filtros del catálogo de documentos (sponsor, programa, país) coinciden con lo que la tabla
 * muestra en sus columnas, no con la regla de aplicabilidad del participante. Estos tests fijan
 * esas dos decisiones, que son fáciles de "corregir" sin darse cuenta de que cambian resultados:
 *
 *  - Filtrar por sponsor NO arrastra los documentos generales (sin ningún sponsor), aunque en la
 *    práctica se le pidan a todos los participantes.
 *  - Programa y país se exigen por separado, no dentro del mismo vínculo documento-programa.
 */

/** Prisma simulado que captura el `where` de findMany/count y no devuelve filas. */
function recordingPrisma() {
  const wheres: Prisma.DocumentsWhereInput[] = [];
  const record = (args: { where: Prisma.DocumentsWhereInput }) => {
    wheres.push(args.where);
    return { then: (resolve: (value: unknown) => void) => resolve([]) };
  };
  const prisma = {
    documents: { findMany: record, count: record },
    $transaction: () => Promise.resolve([[], 0]),
  } as unknown as PrismaService;
  return { prisma, wheres };
}

const BASE = { page: 1, limit: 20 };
const SPONSOR_ID = 'b0a1c2d3-0000-4000-8000-000000000001';
const PROGRAM_ID = 'b0a1c2d3-0000-4000-8000-000000000002';
const COUNTRY_ID = 'b0a1c2d3-0000-4000-8000-000000000003';

async function whereFor(
  filters: Partial<{ sponsorId: string; programId: string; countryId: string }>,
): Promise<Prisma.DocumentsWhereInput> {
  const { prisma, wheres } = recordingPrisma();
  await new DocumentPrismaRepository(prisma).findAll({ ...BASE, ...filters });
  // findMany y count comparten el mismo objeto: basta con el primero.
  return wheres[0];
}

describe('DocumentPrismaRepository.findAll — filtros por sponsor, programa y país', () => {
  it('sin filtros no agrega ninguna condición de relación', async () => {
    const where = await whereFor({});

    expect(where.documentSponsors).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  it('filtra por el vínculo con el sponsor, sin incluir los documentos generales', async () => {
    const where = await whereFor({ sponsorId: SPONSOR_ID });

    expect(where.documentSponsors).toEqual({ some: { sponsorId: SPONSOR_ID } });
    // Nada de `{ documentSponsors: { none: ... } }`: los generales quedan fuera a propósito.
    expect(JSON.stringify(where)).not.toContain('none');
  });

  it('filtra por programa', async () => {
    const where = await whereFor({ programId: PROGRAM_ID });

    expect(where.AND).toEqual([{ documentPrograms: { some: { programId: PROGRAM_ID } } }]);
  });

  it('filtra por país a través de las descripciones del programa', async () => {
    const where = await whereFor({ countryId: COUNTRY_ID });

    expect(where.AND).toEqual([
      {
        documentPrograms: {
          some: { descriptions: { some: { countries: { some: { countryId: COUNTRY_ID } } } } },
        },
      },
    ]);
  });

  it('exige programa y país por separado, no dentro del mismo vínculo', async () => {
    // Un documento configurado en (WAT USA → Perú) y (Internship USA → Argentina) debe salir al
    // filtrar por WAT USA y también al filtrar por Argentina, porque eso es lo que muestran sus
    // columnas. Con un solo `some` que pidiera ambas cosas a la vez, no saldría en ninguno.
    const where = await whereFor({ programId: PROGRAM_ID, countryId: COUNTRY_ID });

    expect(where.AND).toHaveLength(2);
    expect(where.AND).toEqual([
      { documentPrograms: { some: { programId: PROGRAM_ID } } },
      {
        documentPrograms: {
          some: { descriptions: { some: { countries: { some: { countryId: COUNTRY_ID } } } } },
        },
      },
    ]);
  });

  it('combina los tres filtros', async () => {
    const where = await whereFor({
      sponsorId: SPONSOR_ID,
      programId: PROGRAM_ID,
      countryId: COUNTRY_ID,
    });

    expect(where.documentSponsors).toEqual({ some: { sponsorId: SPONSOR_ID } });
    expect(where.AND).toHaveLength(2);
  });
});
