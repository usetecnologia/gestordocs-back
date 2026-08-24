import { Prisma } from 'prisma/generated/prisma/client';
import type { PrismaService } from '@shared/prisma/prisma.service';
import { ProcesoPrismaRepository } from './proceso.prisma.repository';

/**
 * `estado` y `activo` son un par: `activo` vale `true` mientras el proceso está `EN_PROCESO` y
 * `null` cuando está `FINALIZADO`, **nunca `false`**. De eso depende `uq_proceso_activo`, que es lo
 * único que impide que un participante tenga dos procesos abiertos: los NULL no colisionan en un
 * índice único de MariaDB, pero los `false` sí — un solo `activo = false` y la garantía se cae.
 *
 * Estos tests fijan que los tres métodos que escriben ese par lo escriban completo y coherente
 * (decisión §2.5 del documento de estado: un único lugar, cubierto por un test).
 */

const FILA = {
  id: 'p1',
  participanteId: 'u1',
  programId: 'prog-1',
  optionProgramId: 'opt-1',
  countryId: 'pais-1',
  sponsorId: null,
  temporadaId: null,
  estado: 'EN_PROCESO',
  statusDocumental: 'SIN_DOCUMENTOS',
  activo: true,
  fechaIngreso: new Date('2026-01-01'),
  finalizadoAt: null,
  finalizadoById: null,
  crmProcesoId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

/**
 * Prisma simulado que captura los `data` con los que se escribe `procesos` y `User`.
 *
 * `$transaction` ejecuta el callback con el mismo cliente: las tres escrituras van en transacción
 * porque el proceso y el puntero `User.procesoVisibleId` no pueden quedar en desacuerdo.
 */
function recordingPrisma(createError?: unknown) {
  const creates: any[] = [];
  const updates: any[] = [];
  const userUpdates: any[] = [];
  const adopciones: any[] = [];
  const cliente = {
    proceso: {
      create: (args: any) => {
        creates.push(args);
        if (createError) return Promise.reject(createError);
        return Promise.resolve(FILA);
      },
      update: (args: any) => {
        updates.push(args);
        return Promise.resolve({ ...FILA, ...args.data });
      },
      findFirst: () => Promise.resolve(FILA),
    },
    user: {
      update: (args: any) => {
        userUpdates.push(args);
        return Promise.resolve({});
      },
    },
    userHistoryStatus: {
      create: () => Promise.resolve({}),
      updateMany: (args: any) => {
        adopciones.push(args);
        return Promise.resolve({ count: 0 });
      },
    },
  };
  const prisma = {
    ...cliente,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(cliente),
  } as unknown as PrismaService;
  return { prisma, creates, updates, userUpdates, adopciones };
}

describe('ProcesoPrismaRepository — el par estado/activo', () => {
  it('crearProcesoAbierto escribe EN_PROCESO con activo = true', async () => {
    const { prisma, creates } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).crearProcesoAbierto({
      participanteId: 'u1',
      programId: 'prog-1',
      optionProgramId: 'opt-1',
      countryId: 'pais-1',
      sponsorId: null,
      temporadaId: null,
      statusDocumental: 'SIN_DOCUMENTOS',
    });

    expect(creates[0].data).toMatchObject({ estado: 'EN_PROCESO', activo: true });
  });

  it('crearProcesoAbierto deja el proceso nuevo como el visible del participante', async () => {
    const { prisma, userUpdates } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).crearProcesoAbierto({
      participanteId: 'u1',
      programId: 'prog-1',
      optionProgramId: 'opt-1',
      countryId: 'pais-1',
      sponsorId: null,
      temporadaId: null,
      statusDocumental: 'SIN_DOCUMENTOS',
    });

    expect(userUpdates).toEqual([
      { where: { id: 'u1' }, data: { procesoVisibleId: 'p1' } },
    ]);
  });

  /**
   * El primer proceso adopta las entradas de historial que quedaron sin ciclo: son las del alta del
   * participante, escritas antes de que su proceso exista. Sin esto, su línea de tiempo arrancaría
   * vacía — el filtro del mapper descarta lo que no tiene proceso.
   */
  it('crearProcesoAbierto adopta las entradas de historial huérfanas del participante', async () => {
    const { prisma, adopciones } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).crearProcesoAbierto({
      participanteId: 'u1',
      programId: 'prog-1',
      optionProgramId: 'opt-1',
      countryId: 'pais-1',
      sponsorId: null,
      temporadaId: null,
      statusDocumental: 'SIN_DOCUMENTOS',
    });

    expect(adopciones).toEqual([
      {
        where: { userId: 'u1', procesoId: null },
        data: { procesoId: 'p1' },
      },
    ]);
  });

  it('crearProcesoDeNuevoCiclo NO adopta huérfanos: pertenecerían al primer ciclo', async () => {
    const { prisma, adopciones } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).crearProcesoDeNuevoCiclo({
      participanteId: 'u1',
      programId: 'prog-1',
      optionProgramId: 'opt-1',
      countryId: 'pais-1',
      sponsorId: null,
      temporadaId: null,
      statusDocumental: 'SIN_DOCUMENTOS',
    });

    expect(adopciones).toHaveLength(0);
  });

  it('finalizar escribe FINALIZADO con activo = null, y nunca false', async () => {
    const { prisma, updates } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).finalizar('p1', 'staff-1');

    expect(updates[0].where).toEqual({ id: 'p1' });
    expect(updates[0].data).toMatchObject({
      estado: 'FINALIZADO',
      activo: null,
      finalizadoById: 'staff-1',
    });
    expect(updates[0].data.activo).not.toBe(false);
    expect(updates[0].data.finalizadoAt).toBeInstanceOf(Date);
  });

  it.each([
    ['finalizar', (repo: ProcesoPrismaRepository) => repo.finalizar('p1', 'staff-1')],
    ['reabrir', (repo: ProcesoPrismaRepository) => repo.reabrir('p1')],
  ])('%s deja el puntero del proceso visible apuntando a ese proceso', async (_nombre, run) => {
    const { prisma, userUpdates } = recordingPrisma();

    await run(new ProcesoPrismaRepository(prisma));

    expect(userUpdates).toEqual([
      { where: { id: 'u1' }, data: { procesoVisibleId: 'p1' } },
    ]);
  });

  it('reabrir vuelve a EN_PROCESO con activo = true y borra la finalización', async () => {
    const { prisma, updates } = recordingPrisma();

    await new ProcesoPrismaRepository(prisma).reabrir('p1');

    expect(updates[0].data).toMatchObject({
      estado: 'EN_PROCESO',
      activo: true,
      finalizadoAt: null,
      finalizadoById: null,
    });
  });

  it('crearProcesoAbierto devuelve el proceso del ganador si pierde la carrera', async () => {
    // Dos sincronizaciones concurrentes del mismo participante: `uq_proceso_activo` deja pasar una
    // sola, y la que pierde no debe propagar el error — se queda con el proceso que ya existe.
    const duplicado = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { prisma } = recordingPrisma(duplicado);

    const proceso = await new ProcesoPrismaRepository(prisma).crearProcesoAbierto({
      participanteId: 'u1',
      programId: 'prog-1',
      optionProgramId: 'opt-1',
      countryId: 'pais-1',
      sponsorId: null,
      temporadaId: null,
      statusDocumental: 'SIN_DOCUMENTOS',
    });

    expect(proceso.id).toBe('p1');
  });

  it('crearProcesoAbierto propaga cualquier otro error', async () => {
    const { prisma } = recordingPrisma(new Error('caída de red'));

    await expect(
      new ProcesoPrismaRepository(prisma).crearProcesoAbierto({
        participanteId: 'u1',
        programId: 'prog-1',
        optionProgramId: 'opt-1',
        countryId: 'pais-1',
        sponsorId: null,
        temporadaId: null,
        statusDocumental: 'SIN_DOCUMENTOS',
      }),
    ).rejects.toThrow('caída de red');
  });
});
