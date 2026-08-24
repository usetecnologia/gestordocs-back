import { Logger } from '@nestjs/common';
import { Proceso } from '../../domain/proceso.entity';
import { IProcesoRepository, ProcesoParaAccion } from '../../domain/proceso.repository';
import { FinalizarProcesoUseCase } from './finalizar-proceso.use-case';
import { ContinuarProcesoUseCase } from './continuar-proceso.use-case';

/**
 * Las dos acciones de USE sobre un ciclo, **dirigidas por id de proceso**.
 *
 * ⛔ El motivo de que sea por id y no por DNI se vio en pruebas: recibiendo DNIs, el caso de uso
 * cerraba "el ciclo abierto del participante", así que con el listado filtrado a un ciclo
 * *finalizado* la acción cerraba **otro** ciclo — uno que no estaba en la tabla. Lo que se ve es lo
 * que se cierra.
 *
 * Lo demás que se protege: un ciclo que falla no arrastra a los demás, y reabrir exige que ese ciclo
 * esté cerrado y que el participante no tenga otro abierto.
 */

function paraAccion(
  id: string,
  estado: 'EN_PROCESO' | 'FINALIZADO',
  dni: string | null = '12345678',
): ProcesoParaAccion {
  return { id, estado, participanteId: 'u1', dni };
}

function unProceso(id: string, estado: 'EN_PROCESO' | 'FINALIZADO'): Proceso {
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
function fakeRepo(
  disponibles: ProcesoParaAccion[],
  overrides: Partial<IProcesoRepository> = {},
) {
  const finalizados: Array<{ procesoId: string; finalizadoById: string }> = [];
  const reabiertos: string[] = [];
  const noUsado = () => Promise.reject(new Error('no se usa en estos tests'));

  const repo: IProcesoRepository = {
    findProcesosParaAccion: (ids: readonly string[]) =>
      Promise.resolve(disponibles.filter((p) => ids.includes(p.id))),
    findAbiertoByParticipante: () => Promise.resolve(null),
    finalizar: (procesoId: string, finalizadoById: string) => {
      finalizados.push({ procesoId, finalizadoById });
      return Promise.resolve(unProceso(procesoId, 'FINALIZADO'));
    },
    reabrir: (procesoId: string) => {
      reabiertos.push(procesoId);
      return Promise.resolve(unProceso(procesoId, 'EN_PROCESO'));
    },
    findVisibleByParticipante: noUsado,
    findUltimoFinalizadoByParticipante: noUsado,
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

  it('cierra exactamente los ciclos indicados, registrando quién lo hizo', async () => {
    const { repo, finalizados } = fakeRepo([
      paraAccion('p-1', 'EN_PROCESO', '111'),
      paraAccion('p-2', 'EN_PROCESO', '222'),
    ]);

    const result = await new FinalizarProcesoUseCase(repo).execute(['p-1', 'p-2'], 'staff-1');

    expect(result).toEqual({
      totalSuccess: 2,
      totalErrors: 0,
      successes: ['111', '222'],
      errors: [],
    });
    expect(finalizados).toEqual([
      { procesoId: 'p-1', finalizadoById: 'staff-1' },
      { procesoId: 'p-2', finalizadoById: 'staff-1' },
    ]);
  });

  /**
   * El fallo que motivó el cambio: al pedir cerrar un ciclo ya finalizado, la versión por DNI
   * cerraba el ciclo abierto de ese participante. Ahora no toca nada.
   */
  it('no toca ningún otro ciclo si el indicado ya está finalizado', async () => {
    const { repo, finalizados } = fakeRepo([
      paraAccion('p-cerrado', 'FINALIZADO'),
      paraAccion('p-abierto', 'EN_PROCESO'),
    ]);

    const result = await new FinalizarProcesoUseCase(repo).execute(['p-cerrado'], 'staff-1');

    expect(finalizados).toHaveLength(0);
    expect(result.totalSuccess).toBe(0);
    expect(result.errors).toEqual([
      { procesoId: 'p-cerrado', dni: '12345678', reason: 'Ese ciclo ya está finalizado.' },
    ]);
  });

  it('sigue con los demás cuando uno del lote falla', async () => {
    const { repo, finalizados } = fakeRepo([
      paraAccion('p-1', 'EN_PROCESO', '111'),
      paraAccion('p-2', 'FINALIZADO', '222'),
      paraAccion('p-3', 'EN_PROCESO', '333'),
    ]);

    const result = await new FinalizarProcesoUseCase(repo).execute(
      ['p-1', 'p-2', 'p-3'],
      'staff-1',
    );

    expect(result.totalSuccess).toBe(2);
    expect(result.successes).toEqual(['111', '333']);
    expect(result.errors).toHaveLength(1);
    expect(finalizados.map((f) => f.procesoId)).toEqual(['p-1', 'p-3']);
  });

  it('reporta el id que no corresponde a ningún proceso', async () => {
    const { repo, finalizados } = fakeRepo([]);

    const result = await new FinalizarProcesoUseCase(repo).execute(['fantasma'], 'staff-1');

    expect(result.errors).toEqual([
      { procesoId: 'fantasma', dni: null, reason: 'El proceso no existe.' },
    ]);
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

  it('reabre el ciclo indicado', async () => {
    const { repo, reabiertos } = fakeRepo([paraAccion('p-viejo', 'FINALIZADO')]);

    await expect(new ContinuarProcesoUseCase(repo).execute('p-viejo')).resolves.toBeUndefined();
    expect(reabiertos).toEqual(['p-viejo']);
  });

  it('rechaza reabrir un ciclo que no está finalizado', async () => {
    const { repo, reabiertos } = fakeRepo([paraAccion('p-abierto', 'EN_PROCESO')]);

    await expect(new ContinuarProcesoUseCase(repo).execute('p-abierto')).rejects.toThrow(
      'no está finalizado',
    );
    expect(reabiertos).toHaveLength(0);
  });

  it('rechaza reabrir si el participante ya tiene otro ciclo abierto', async () => {
    const { repo, reabiertos } = fakeRepo([paraAccion('p-viejo', 'FINALIZADO')], {
      findAbiertoByParticipante: () => Promise.resolve(unProceso('p-otro', 'EN_PROCESO')),
    });

    await expect(new ContinuarProcesoUseCase(repo).execute('p-viejo')).rejects.toThrow(
      'ya tiene un proceso abierto',
    );
    expect(reabiertos).toHaveLength(0);
  });

  it('rechaza si el proceso no existe', async () => {
    const { repo, reabiertos } = fakeRepo([]);

    await expect(new ContinuarProcesoUseCase(repo).execute('fantasma')).rejects.toThrow(
      'El proceso no existe',
    );
    expect(reabiertos).toHaveLength(0);
  });
});
