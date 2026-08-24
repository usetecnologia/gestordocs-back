import { Logger } from '@nestjs/common';
import type { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { Proceso } from '../../domain/proceso.entity';
import {
  CreateProcesoData,
  IProcesoRepository,
  ParticipanteParaProceso,
} from '../../domain/proceso.repository';
import { CrearNuevoProcesoUseCase } from './crear-nuevo-proceso.use-case';

/**
 * Abrir el ciclo siguiente es una **acción del participante**, no un efecto secundario de mirar una
 * pantalla. Estuvo colgado de `EnsureProcesoInicial` —que llama la sincronización de documentos— y el
 * resultado fue que abrir el expediente desde el panel de USE le creaba un ciclo nuevo.
 *
 * Lo que estos tests fijan: el ciclo nuevo arranca **desde cero** sin heredar el avance del anterior,
 * no se puede abrir con uno en curso, y el expediente se arma en el mismo movimiento para que el
 * participante lo encuentre listo.
 */

const PARTICIPANTE: ParticipanteParaProceso = {
  id: 'u1',
  roleCode: 'PARTICIPANTE',
  programId: 'prog-1',
  optionProgramId: 'opt-1',
  countryId: 'pais-1',
  sponsorId: 'sp-1',
  status: 'APROBADO_SPONSOR',
};

function unProceso(id: string, estado: 'EN_PROCESO' | 'FINALIZADO' = 'EN_PROCESO'): Proceso {
  return new Proceso(
    id,
    'u1',
    'prog-1',
    'opt-1',
    'pais-1',
    'sp-1',
    'temp-1',
    estado,
    'SIN_DOCUMENTOS',
    estado === 'EN_PROCESO' ? true : null,
    new Date('2026-08-25'),
  );
}

function armar(overrides: Partial<IProcesoRepository> = {}) {
  const creados: CreateProcesoData[] = [];
  const sincronizados: string[] = [];
  const noUsado = () => Promise.reject(new Error('no se usa en estos tests'));

  const repo: IProcesoRepository = {
    findAbiertoByParticipante: () => Promise.resolve(null),
    findParticipanteParaProceso: () => Promise.resolve(PARTICIPANTE),
    findTemporadaActivaDeProgram: () => Promise.resolve('temp-activa'),
    crearProcesoDeNuevoCiclo: (data: CreateProcesoData) => {
      creados.push(data);
      return Promise.resolve(unProceso('p-nuevo'));
    },
    findVisibleByParticipante: noUsado,
    findUltimoFinalizadoByParticipante: noUsado,
    findHistorialByParticipante: noUsado,
    findProcesosParaAccion: noUsado,
    crearProcesoAbierto: noUsado,
    finalizar: noUsado,
    reabrir: noUsado,
    ...overrides,
  };

  const sync = {
    execute: (userId: string) => {
      sincronizados.push(userId);
      return Promise.resolve();
    },
  } as unknown as SyncUserDocumentsUseCase;

  return { useCase: new CrearNuevoProcesoUseCase(repo, sync), creados, sincronizados };
}

describe('CrearNuevoProcesoUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('abre el ciclo desde cero, sin heredar el avance del anterior', async () => {
    const { useCase, creados } = armar();

    await expect(useCase.execute('u1')).resolves.toMatchObject({ id: 'p-nuevo' });
    expect(creados).toEqual([
      {
        participanteId: 'u1',
        programId: 'prog-1',
        optionProgramId: 'opt-1',
        countryId: 'pais-1',
        sponsorId: 'sp-1',
        temporadaId: 'temp-activa',
        // El participante venía en APROBADO_SPONSOR: el ciclo nuevo NO lo hereda.
        statusDocumental: 'SIN_DOCUMENTOS',
      },
    ]);
  });

  it('arma el expediente del ciclo nuevo en el mismo movimiento', async () => {
    const { useCase, sincronizados } = armar();

    await useCase.execute('u1');

    expect(sincronizados).toEqual(['u1']);
  });

  it('rechaza abrir otro si ya tiene uno en curso', async () => {
    const { useCase, creados, sincronizados } = armar({
      findAbiertoByParticipante: () => Promise.resolve(unProceso('p-abierto')),
    });

    await expect(useCase.execute('u1')).rejects.toThrow('Ya tienes un proceso en curso');
    expect(creados).toHaveLength(0);
    expect(sincronizados).toHaveLength(0);
  });

  it('rechaza si el usuario no existe', async () => {
    const { useCase, creados } = armar({
      findParticipanteParaProceso: () => Promise.resolve(null),
    });

    await expect(useCase.execute('fantasma')).rejects.toThrow('No se encontró el participante');
    expect(creados).toHaveLength(0);
  });

  it('rechaza si quien pide no es participante', async () => {
    const { useCase, creados } = armar({
      findParticipanteParaProceso: () => Promise.resolve({ ...PARTICIPANTE, roleCode: 'ASESOR' }),
    });

    await expect(useCase.execute('u1')).rejects.toThrow('Solo un participante');
    expect(creados).toHaveLength(0);
  });

  it('rechaza, sin crear nada, si al participante le falta un dato obligatorio', async () => {
    const { useCase, creados, sincronizados } = armar({
      findParticipanteParaProceso: () =>
        Promise.resolve({ ...PARTICIPANTE, optionProgramId: null }),
    });

    await expect(useCase.execute('u1')).rejects.toThrow('datos están incompletos');
    expect(creados).toHaveLength(0);
    expect(sincronizados).toHaveLength(0);
  });
});
