import { Logger } from '@nestjs/common';
import { Prisma } from 'prisma/generated/prisma/client';
import type { PrismaService } from '@shared/prisma/prisma.service';
import { UserDocumentFilter } from '../../domain/user-documents.repository';
import { UserDocumentsPrismaRepository } from './user-documents.prisma.repository';

/**
 * La sincronización de documentos se dispara desde varios puntos (autologin, listado de documentos,
 * info del participante, revisiones masivas) sin ningún lock. Cuando dos ejecuciones concurren, la
 * que pierde la carrera choca contra los índices únicos `uq_user_documents_sponsor_active` /
 * `uq_user_documents_document_active` y Prisma lanza P2002: el registro que iba a crear ya existe,
 * así que su escritura no aporta nada y debe descartarse en silencio.
 *
 * Estos tests fijan ese contrato: P2002 se ignora en las escrituras del sync y CUALQUIER otro error
 * se propaga, para que la tolerancia no acabe ocultando fallos reales.
 */

const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('simulated failure', {
    code,
    clientVersion: 'test',
  });
}

/**
 * Prisma simulado cuyas operaciones fallan siempre con el error indicado.
 *
 * Devuelve thenables perezosos para imitar a las PrismaPromise reales: dentro de
 * `$transaction([...])` las operaciones no se ejecutan hasta que se espera la transacción. Con
 * promesas normales, las del array quedarían rechazadas sin manejador y tumbarían el proceso.
 */
function failingPrisma(error: unknown): PrismaService {
  const lazyReject = () => ({
    then: (_resolve: unknown, reject: (reason: unknown) => void) =>
      reject(error),
  });
  return {
    userDocuments: { create: lazyReject, update: lazyReject },
    userDocumentHistory: { create: lazyReject },
    $transaction: lazyReject,
  } as unknown as PrismaService;
}

/** Prisma simulado que registra las escrituras recibidas y siempre tiene éxito. */
function recordingPrisma() {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const prisma = {
    userDocuments: {
      create: (args: unknown) => {
        created.push(args);
        return Promise.resolve({});
      },
      update: (args: unknown) => {
        updated.push(args);
        return Promise.resolve({});
      },
    },
    userDocumentHistory: { create: () => Promise.resolve({}) },
    $transaction: () => Promise.resolve([]),
  } as unknown as PrismaService;
  return { prisma, created, updated };
}

/** Las cuatro escrituras que ejecuta la sincronización. */
const SYNC_WRITES: {
  name: string;
  run: (repo: UserDocumentsPrismaRepository) => Promise<void>;
}[] = [
  {
    name: 'createWithHistory',
    run: (repo) =>
      repo.createWithHistory({ userId: 'u1', documentSponsorId: 'ds1' }),
  },
  {
    name: 'cloneDocumentForNewSponsor',
    run: (repo) =>
      repo.cloneDocumentForNewSponsor({
        userId: 'u1',
        documentSponsorId: 'ds1',
        status: 'SUBIDO',
        url: null,
      }),
  },
  {
    name: 'refreshDocumentFromLatest',
    run: (repo) =>
      repo.refreshDocumentFromLatest({
        userDocumentId: 'ud1',
        status: 'SUBIDO',
        url: null,
      }),
  },
  {
    name: 'updateStatusDocument',
    run: (repo) => repo.updateStatusDocument('ud1', false),
  },
];

describe('UserDocumentsPrismaRepository — escrituras de la sincronización', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(SYNC_WRITES)(
    '$name descarta el choque de unicidad de una sincronización concurrente',
    async ({ run }) => {
      const repo = new UserDocumentsPrismaRepository(
        failingPrisma(prismaError(UNIQUE_VIOLATION)),
      );

      await expect(run(repo)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Sincronización concurrente'),
      );
    },
  );

  it.each(SYNC_WRITES)(
    '$name propaga los demás errores de Prisma',
    async ({ run }) => {
      const repo = new UserDocumentsPrismaRepository(
        failingPrisma(prismaError(RECORD_NOT_FOUND)),
      );

      await expect(run(repo)).rejects.toMatchObject({ code: RECORD_NOT_FOUND });
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it.each(SYNC_WRITES)(
    '$name propaga los errores ajenos a Prisma',
    async ({ run }) => {
      const repo = new UserDocumentsPrismaRepository(
        failingPrisma(new Error('caída de red')),
      );

      await expect(run(repo)).rejects.toThrow('caída de red');
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('createWithHistory crea el registro activo con su primer historial PENDIENTE', async () => {
    const { prisma, created } = recordingPrisma();
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.createWithHistory({ userId: 'u1', documentSponsorId: 'ds1' });

    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      data: {
        userId: 'u1',
        documentSponsorId: 'ds1',
        documentId: null,
        status: 'PENDIENTE',
        statusDocument: true,
        userDocumentHistory: { create: { status: 'PENDIENTE' } },
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('updateStatusDocument cambia la vigencia del registro indicado', async () => {
    const { prisma, updated } = recordingPrisma();
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.updateStatusDocument('ud1', false);

    expect(updated).toEqual([
      { where: { id: 'ud1' }, data: { statusDocument: false } },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
});

/**
 * Prisma simulado que captura el `where` con el que se consultan los documentos del participante
 * y devuelve el contexto de aplicabilidad indicado.
 */
function readingPrisma(context: {
  programId: string | null;
  countryId: string | null;
  sponsorCode?: string | null;
}) {
  const queries: { where: unknown }[] = [];
  const prisma = {
    user: {
      findUnique: () =>
        Promise.resolve({
          programId: context.programId,
          countryId: context.countryId,
          sponsor: context.sponsorCode ? { code: context.sponsorCode } : null,
        }),
    },
    userDocuments: {
      findMany: (args: { where: unknown }) => {
        queries.push(args);
        return Promise.resolve([]);
      },
      count: (args: { where: unknown }) => {
        queries.push(args);
        return Promise.resolve(0);
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PrismaService;
  return { prisma, queries };
}

/**
 * El país del participante forma parte del criterio de lectura, no solo del sync: si el expediente
 * arrastra un documento que no está configurado para su país, no debe aparecer ni contar como
 * obligatorio pendiente. Estos tests fijan que el filtro viaja en la consulta.
 */
describe('UserDocumentsPrismaRepository — alcance por programa y país en la lectura', () => {
  /** La condición de alcance es la única que baja hasta `documentPrograms`. */
  const scopeOf = (where: unknown): unknown =>
    (where as { AND: unknown[] }).AND.find((c) =>
      JSON.stringify(c).includes('documentPrograms'),
    );

  it('findByUserIdWithHistory restringe por el programa y el país del participante', async () => {
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.findByUserIdWithHistory('u1');

    expect(queries).toHaveLength(1);
    expect(scopeOf(queries[0].where)).toEqual({
      OR: [
        {
          documentId: { not: null },
          documents: {
            documentPrograms: {
              some: {
                programId: 'prog-1',
                status: true,
                descriptions: { some: { countries: { some: { countryId: 'pe' } } } },
              },
            },
          },
        },
        {
          documentSponsorId: { not: null },
          documentSponsors: {
            document: {
              documentPrograms: {
                some: {
                  programId: 'prog-1',
                  status: true,
                  descriptions: { some: { countries: { some: { countryId: 'pe' } } } },
                },
              },
            },
          },
        },
      ],
    });
  });

  it('findByUserIdWithHistory conserva el filtro de obligatorios junto al de país', async () => {
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.findByUserIdWithHistory('u1', UserDocumentFilter.REQUIRED);

    const and = (queries[0].where as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
    expect(and).toContainEqual({
      OR: [
        { documentSponsors: { required: true } },
        { documentSponsorId: null, documents: { required: true } },
      ],
    });
    expect(scopeOf(queries[0].where)).toBeDefined();
  });

  it('findByUserIdWithHistory no filtra si al participante le falta programa o país', async () => {
    // Sin esas dos dimensiones no hay nada con qué decidir: se prefiere devolver el expediente
    // tal como está antes que mostrarlo vacío (mismo criterio que el sync, que se omite).
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: null });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.findByUserIdWithHistory('u1');

    expect(scopeOf(queries[0].where)).toBeUndefined();
  });

  it('countRequiredDocs cuenta sobre el mismo alcance de programa y país', async () => {
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.countRequiredDocs('u1');

    expect(queries).toHaveLength(2);
    for (const q of queries) expect(scopeOf(q.where)).toBeDefined();
  });

  it('countRequiredDocs no filtra si al participante le falta programa o país', async () => {
    const { prisma, queries } = readingPrisma({ programId: null, countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.countRequiredDocs('u1');

    for (const q of queries) expect(scopeOf(q.where)).toBeUndefined();
  });
});
