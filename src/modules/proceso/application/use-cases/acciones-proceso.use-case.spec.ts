import { Logger } from '@nestjs/common';
import { Proceso } from '../../domain/proceso.entity';
import { IProcesoRepository } from '../../domain/proceso.repository';
import { FinalizarProcesoUseCase } from './finalizar-proceso.use-case';
import { ContinuarProcesoUseCase } from './continuar-proceso.use-case';

/**
 * Las dos acciones de USE sobre un proceso ya abierto. Lo que estos tests protegen:
 *
 * - Finalizar es masivo y **tolerante**: un DNI que falla no puede arrastrar a los demás, igual que
 *   el resto de las acciones masivas del proyecto.
 * - Continuar reabre **el mismo** registro, y solo si hay uno finalizado y ninguno abierto. Reabrir
 *   con otro abierto violaría `uq_proceso_activo`; el corte previo existe para dar un mensaje que se
 *   entienda en vez de dejar salir el error de la base.
 * - Ninguna de las dos toca documentos.
 */

function proceso(id: string, estado: 'EN_PROCESO' | 'FINALIZADO'): Proceso {
  return new Proceso(
    id,
    'u1',
    'prog-1',
    'opt-1',
    'pais-1',
    'sp-1',
    'temp-1',
    estado,
    'DOCUMENTOS_INCOMPLETOS',
    estado === 'EN_PROCESO' ? true : null,
    new Date('2026-01-01'),
  );
}

/** Repositorio simulado que registra las finalizaciones y reaperturas pedidas. */
function fakeRepo(overrides: Partial<IProcesoRepository> = {}) {
  const finalizados: Array<{ procesoId: string; finalizadoById: string }> = [];
  const reabiertos: string[] = [];
  const noUsado = () => Promise.reject(new Error('no se usa en estos tests'));
  const repo: IProcesoRepository = {
    findParticipanteIdByDni: (dni: string) => Promise.resolve(`user-${dni}`),
    findAbiertoByParticipante: () => Promise.resolve(proceso('p-abierto', 'EN_PROCESO')),
    findUltimoFinalizadoByParticipante: () => Promise.resolve(null),
    finalizar: (procesoId: string, finalizadoById: string) => {
      finalizados.push({ procesoId, finalizadoById });
      return Promise.resolve(proceso(procesoId, 'FINALIZADO'));
    },
    reabrir: (procesoId: string) => {
      reabiertos.push(procesoId);
      return Promise.resolve(proceso(procesoId, 'EN_PROCESO'));
    },
    findVisibleByParticipante: noUsado,
    findHistorialByParticipante: noUsado,
    findParticipanteParaProceso: noUsado,
    findTemporadaActivaDeProgram: noUsado,
    crearProcesoAbierto: noUsado,
    crearProcesoDeNuevoCiclo: noUsado,
    ...overrides,
  };
  return { repo, finalizados, reabiertos };
}

describe('FinalizarProcesoUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finaliza el proceso abierto de cada DNI, registrando quién lo hizo', async () => {
    const { repo, finalizados } = fakeRepo({
      findAbiertoByParticipante: (participanteId: string) =>
        Promise.resolve(proceso(`p-${participanteId}`, 'EN_PROCESO')),
    });

    const result = await new FinalizarProcesoUseCase(repo).execute(['111', '222'], 'staff-1');

    expect(result).toEqual({
      totalSuccess: 2,
      totalErrors: 0,
      successes: ['111', '222'],
      errors: [],
    });
    expect(finalizados).toEqual([
      { procesoId: 'p-user-111', finalizadoById: 'staff-1' },
      { procesoId: 'p-user-222', finalizadoById: 'staff-1' },
    ]);
  });

  it('sigue con los demás DNIs cuando uno no tiene proceso abierto', async () => {
    const { repo, finalizados } = fakeRepo({
      findAbiertoByParticipante: (participanteId: string) =>
        Promise.resolve(
          participanteId === 'user-222' ? null : proceso('p-ok', 'EN_PROCESO'),
        ),
    });

    const result = await new FinalizarProcesoUseCase(repo).execute(['111', '222', '333'], 'staff-1');

    expect(result.totalSuccess).toBe(2);
    expect(result.successes).toEqual(['111', '333']);
    expect(result.errors).toEqual([
      { dni: '222', reason: 'El participante no tiene un proceso abierto.' },
    ]);
    expect(finalizados).toHaveLength(2);
  });

  it('reporta el DNI que no corresponde a ningún participante', async () => {
    const { repo, finalizados } = fakeRepo({
      findParticipanteIdByDni: () => Promise.resolve(null),
    });

    const result = await new FinalizarProcesoUseCase(repo).execute(['fantasma'], 'staff-1');

    expect(result.totalErrors).toBe(1);
    expect(result.errors[0]).toEqual({
      dni: 'fantasma',
      reason: 'No existe un participante con ese DNI.',
    });
    expect(finalizados).toHaveLength(0);
  });
});

describe('ContinuarProcesoUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reabre el último proceso finalizado', async () => {
    const { repo, reabiertos } = fakeRepo({
      findAbiertoByParticipante: () => Promise.resolve(null),
      findUltimoFinalizadoByParticipante: () => Promise.resolve(proceso('p-viejo', 'FINALIZADO')),
    });

    await expect(new ContinuarProcesoUseCase(repo).execute('111')).resolves.toBeUndefined();
    expect(reabiertos).toEqual(['p-viejo']);
  });

  it('rechaza continuar si el participante ya tiene un proceso abierto', async () => {
    const { repo, reabiertos } = fakeRepo();

    await expect(new ContinuarProcesoUseCase(repo).execute('111')).rejects.toThrow(
      'ya tiene un proceso abierto',
    );
    expect(reabiertos).toHaveLength(0);
  });

  it('rechaza continuar si no hay ningún proceso finalizado', async () => {
    const { repo, reabiertos } = fakeRepo({
      findAbiertoByParticipante: () => Promise.resolve(null),
    });

    await expect(new ContinuarProcesoUseCase(repo).execute('111')).rejects.toThrow(
      'ningún proceso finalizado',
    );
    expect(reabiertos).toHaveLength(0);
  });

  it('rechaza continuar si el DNI no corresponde a ningún participante', async () => {
    const { repo, reabiertos } = fakeRepo({
      findParticipanteIdByDni: () => Promise.resolve(null),
    });

    await expect(new ContinuarProcesoUseCase(repo).execute('fantasma')).rejects.toThrow(
      'No existe un participante con el DNI fantasma',
    );
    expect(reabiertos).toHaveLength(0);
  });
});
