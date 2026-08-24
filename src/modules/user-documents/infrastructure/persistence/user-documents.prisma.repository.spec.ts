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
    proceso: { findFirst: () => Promise.resolve({ id: 'p1' }) },
    $transaction: lazyReject,
  } as unknown as PrismaService;
}

/**
 * Prisma simulado que registra las escrituras recibidas y siempre tiene éxito.
 *
 * `proceso` devuelve lo que se le indique: `{ id: 'p1' }` por defecto, o `null` para el
 * participante que todavía no tiene proceso.
 */
function recordingPrisma(proceso: { id: string } | null = { id: 'p1' }) {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const procesoQueries: unknown[] = [];
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
      findFirst: () => Promise.resolve(null),
    },
    userDocumentHistory: { create: () => Promise.resolve({}) },
    proceso: {
      findFirst: (args: unknown) => {
        procesoQueries.push(args);
        return Promise.resolve(proceso);
      },
    },
    $transaction: () => Promise.resolve([]),
  } as unknown as PrismaService;
  return { prisma, created, updated, procesoQueries };
}

/**
 * Las dos escrituras que ejecuta la sincronización. Antes eran cuatro:
 * `cloneDocumentForNewSponsor` y `refreshDocumentFromLatest` se eliminaron con la herencia entre
 * procesos — un ciclo ya no copia el avance de otro.
 */
const SYNC_WRITES: {
  name: string;
  run: (repo: UserDocumentsPrismaRepository) => Promise<void>;
}[] = [
  {
    name: 'createWithHistory',
    run: (repo) =>
      repo.createWithHistory({ userId: 'u1', procesoId: 'p1', documentSponsorId: 'ds1' }),
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

    await repo.createWithHistory({ userId: 'u1', procesoId: 'p1', documentSponsorId: 'ds1' });

    expect(created).toHaveLength(1);
    expect(created[0]).toEqual({
      data: {
        userId: 'u1',
        procesoId: 'p1',
        documentSponsorId: 'ds1',
        documentId: null,
        status: 'PENDIENTE',
        statusDocument: true,
        userDocumentHistory: { create: { status: 'PENDIENTE' } },
      },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * La carga masiva por nombre de archivo no pasa por el sync, así que es el único camino que
   * todavía resuelve el proceso por su cuenta. Tiene que colgarse del proceso ABIERTO: si la
   * consulta dejara de ordenar por `activo`, un participante con ciclos anteriores podría recibir
   * un documento en uno ya finalizado, que por diseño está congelado.
   */
  it('upsertUserDocumentWithStatus busca el proceso abierto, y el más reciente como respaldo', async () => {
    const { prisma, procesoQueries } = recordingPrisma();
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.upsertUserDocumentWithStatus({
      userId: 'u1',
      documentId: 'doc1',
      documentSponsorId: null,
      status: 'SUBIDO',
      url: 'https://archivo',
      createdById: 'staff-1',
    });

    expect(procesoQueries).toEqual([
      {
        where: { participanteId: 'u1' },
        orderBy: [{ activo: 'desc' }, { fechaIngreso: 'desc' }],
        select: { id: true },
      },
    ]);
  });

  /**
   * `procesoId` es NOT NULL en base. Llegar sin proceso significa que se está creando un documento
   * para un participante que todavía no debería tenerlos: se corta con un error en vez de dejar el
   * expediente a medias.
   */
  it('upsertUserDocumentWithStatus falla si el participante no tiene proceso, sin escribir nada', async () => {
    const { prisma, created } = recordingPrisma(null);
    const repo = new UserDocumentsPrismaRepository(prisma);

    await expect(
      repo.upsertUserDocumentWithStatus({
        userId: 'nuevo',
        documentId: 'doc1',
        documentSponsorId: null,
        status: 'SUBIDO',
        url: 'https://archivo',
        createdById: 'staff-1',
      }),
    ).rejects.toThrow('no tiene un proceso abierto');
    expect(created).toHaveLength(0);
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
  /** `null` simula al participante sin proceso visible. */
  procesoVisibleId?: string | null;
}) {
  const queries: { where: unknown }[] = [];
  const procesoVisibleId =
    context.procesoVisibleId === undefined ? 'p-visible' : context.procesoVisibleId;
  const prisma = {
    user: {
      findUnique: () =>
        Promise.resolve({
          programId: context.programId,
          countryId: context.countryId,
          sponsor: context.sponsorCode ? { code: context.sponsorCode } : null,
          procesoVisibleId,
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
 * Toda lectura del expediente va acotada al **proceso visible**, no al `userId`. Es lo que impide el
 * fallo que se vio en producción de pruebas: un participante al que le cerraron el ciclo y volvió a
 * ingresar veía los documentos del ciclo nuevo y los del archivado mezclados (19 filas en vez de 8),
 * y el recálculo de estado contaba los dos — lo sacaba de SIN_DOCUMENTOS sin que hubiera subido nada.
 *
 * Si alguna de estas consultas volviera a filtrar por `userId`, el fallo vuelve sin que nada avise.
 */
describe('UserDocumentsPrismaRepository — el expediente se lee por proceso, no por usuario', () => {
  const procesoDe = (where: unknown): unknown => (where as { procesoId?: unknown }).procesoId;

  it('findByUserIdWithHistory consulta el proceso visible y no el userId', async () => {
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.findByUserIdWithHistory('u1');

    expect(procesoDe(queries[0].where)).toBe('p-visible');
    expect(queries[0].where).not.toHaveProperty('userId');
  });

  it('countRequiredDocs cuenta solo dentro del proceso visible', async () => {
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.countRequiredDocs('u1');

    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(procesoDe(q.where)).toBe('p-visible');
      expect(q.where).not.toHaveProperty('userId');
    }
  });

  it('hasObservedDocument mira solo el proceso visible', async () => {
    // Este era el camino exacto por el que un OBSERVADO del ciclo archivado movía el estado del
    // ciclo nuevo.
    const { prisma, queries } = readingPrisma({ programId: 'prog-1', countryId: 'pe' });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await repo.hasObservedDocument('u1');

    expect(procesoDe(queries[0].where)).toBe('p-visible');
    expect(queries[0].where).not.toHaveProperty('userId');
  });

  /**
   * Sin proceso visible se responde vacío, no "todo". Es el staff, que no tiene expediente, y el
   * caso de datos roto: devolver todas las filas del usuario sería reintroducir el fallo.
   */
  it('sin proceso visible no consulta nada y responde vacío', async () => {
    const { prisma, queries } = readingPrisma({
      programId: 'prog-1',
      countryId: 'pe',
      procesoVisibleId: null,
    });
    const repo = new UserDocumentsPrismaRepository(prisma);

    await expect(repo.findByUserIdWithHistory('u1')).resolves.toEqual([]);
    await expect(repo.countRequiredDocs('u1')).resolves.toEqual({
      totalRequired: 0,
      submittedRequired: 0,
    });
    await expect(repo.hasObservedDocument('u1')).resolves.toBe(false);
    expect(queries).toHaveLength(0);
  });
});

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
