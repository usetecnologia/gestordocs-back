import { Prisma } from 'prisma/generated/prisma/client';
import { espejarStatusDocumental } from './espejar-status-documental';

/**
 * El espejo es lo que sostiene dos afirmaciones del diseño a la vez: que
 * `proceso.statusDocumental` es la fuente de verdad histórica, y que `User.status` sigue sirviendo
 * al embudo, los exports y `email-audience` sin reescribirlos.
 *
 * Lo que se protege acá es el filtro: **`activo: true`**. Es lo único que impide que el estado de un
 * participante mueva un ciclo ya cerrado. Si alguien lo relajara a `participanteId` sin más, un
 * cambio de estado reescribiría procesos finalizados y el registro histórico dejaría de ser
 * histórico — sin que nada fallara a la vista.
 */
function txSimulada() {
  const updateManyArgs: unknown[] = [];
  const tx = {
    proceso: {
      updateMany: (args: unknown) => {
        updateManyArgs.push(args);
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, updateManyArgs };
}

describe('espejarStatusDocumental', () => {
  it('escribe el estado solo en el proceso abierto del participante', async () => {
    const { tx, updateManyArgs } = txSimulada();

    await espejarStatusDocumental(tx, 'u1', 'OBSERVADO');

    expect(updateManyArgs).toEqual([
      {
        where: { participanteId: 'u1', activo: true },
        data: { statusDocumental: 'OBSERVADO' },
      },
    ]);
  });

  it('no filtra por estado: el propio `activo` congela los finalizados', async () => {
    // `activo` vale null en un proceso finalizado, así que `activo: true` no lo alcanza. No hace
    // falta consultar el estado antes ni excluirlo aparte.
    const { tx, updateManyArgs } = txSimulada();

    await espejarStatusDocumental(tx, 'u1', 'APROBADO_SPONSOR');

    const [args] = updateManyArgs as Array<{ where: Record<string, unknown> }>;
    expect(args.where).not.toHaveProperty('estado');
    expect(args.where.activo).toBe(true);
  });
});
