import { Logger } from '@nestjs/common';
import { Proceso } from '../../domain/proceso.entity';
import {
  CreateProcesoData,
  IProcesoRepository,
  ParticipanteParaProceso,
} from '../../domain/proceso.repository';
import { EnsureProcesoInicialUseCase } from './ensure-proceso-inicial.use-case';

/**
 * `EnsureProcesoInicial` es la única puerta por la que un participante obtiene un proceso, y de ella
 * depende que `UserDocuments.procesoId` pueda ser NOT NULL: si dejara de abrirlo en algún caso, el
 * sync se abstendría y el participante se quedaría sin documentos.
 *
 * Solo crea el **primero**. ⛔ No abre el ciclo siguiente, y el test de abajo lo fija: lo hacía, y
 * como a este caso de uso lo llama la sincronización de documentos —que corre desde siete caminos,
 * incluido abrir el expediente desde el panel de USE—, mirar a un participante con el ciclo cerrado
 * le creaba uno nuevo. Abrir el ciclo siguiente es `CrearNuevoProceso`, con su propio endpoint.
 */

const PARTICIPANTE: ParticipanteParaProceso = {
  id: 'u1',
  roleCode: 'PARTICIPANTE',
  programId: 'prog-1',
  optionProgramId: 'opt-1',
  countryId: 'pais-1',
  sponsorId: 'sp-1',
  status: 'DOCUMENTOS_INCOMPLETOS',
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
    'DOCUMENTOS_INCOMPLETOS',
    estado === 'EN_PROCESO' ? true : null,
    new Date('2026-01-01'),
  );
}

/** Repositorio simulado que registra lo que se le pidió crear, y por cuál de los dos caminos. */
function fakeRepo(overrides: Partial<IProcesoRepository> = {}) {
  const primeros: CreateProcesoData[] = [];
  const nuevosCiclos: CreateProcesoData[] = [];
  const noUsado = () => Promise.reject(new Error('no se usa en estos tests'));
  const repo: IProcesoRepository = {
    findVisibleByParticipante: () => Promise.resolve(null),
    findAbiertoByParticipante: () => Promise.resolve(null),
    findUltimoFinalizadoByParticipante: () => Promise.resolve(null),
    findParticipanteParaProceso: () => Promise.resolve(PARTICIPANTE),
    findTemporadaActivaDeProgram: () => Promise.resolve('temp-activa'),
    crearProcesoAbierto: (data: CreateProcesoData) => {
      primeros.push(data);
      return Promise.resolve(unProceso('p-primero'));
    },
    crearProcesoDeNuevoCiclo: (data: CreateProcesoData) => {
      nuevosCiclos.push(data);
      return Promise.resolve(unProceso('p-ciclo-2'));
    },
    findHistorialByParticipante: noUsado,
    findProcesosParaAccion: noUsado,
    finalizar: noUsado,
    reabrir: noUsado,
    ...overrides,
  };
  const useCase = new EnsureProcesoInicialUseCase(repo);
  return { useCase, primeros, nuevosCiclos };
}

describe('EnsureProcesoInicialUseCase', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('devuelve el proceso abierto sin crear otro', async () => {
    const { useCase, primeros, nuevosCiclos } = fakeRepo({
      findVisibleByParticipante: () => Promise.resolve(unProceso('p-abierto')),
    });

    await expect(useCase.execute('u1')).resolves.toMatchObject({ id: 'p-abierto' });
    expect(primeros).toHaveLength(0);
    expect(nuevosCiclos).toHaveLength(0);
  });

  describe('primer proceso del participante', () => {
    it('lo abre copiando programa, opción, país, sponsor y estado', async () => {
      const { useCase, primeros } = fakeRepo();

      await expect(useCase.execute('u1')).resolves.toMatchObject({ id: 'p-primero' });
      expect(primeros).toEqual([
        {
          participanteId: 'u1',
          programId: 'prog-1',
          optionProgramId: 'opt-1',
          countryId: 'pais-1',
          sponsorId: 'sp-1',
          temporadaId: 'temp-activa',
          statusDocumental: 'DOCUMENTOS_INCOMPLETOS',
        },
      ]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('lo abre sin sponsor cuando el participante no tiene contrato', async () => {
      // La regla `status_hired === 1` ya la aplicó el upsert de Workuse: acá el sponsor llega en
      // null y el proceso nace sin él, con documentos generales nada más.
      const { useCase, primeros } = fakeRepo({
        findParticipanteParaProceso: () => Promise.resolve({ ...PARTICIPANTE, sponsorId: null }),
      });

      await useCase.execute('u1');

      expect(primeros[0]).toMatchObject({ sponsorId: null });
    });

    it('deja la temporada en null si el programa no tiene ninguna activa', async () => {
      const { useCase, primeros } = fakeRepo({
        findTemporadaActivaDeProgram: () => Promise.resolve(null),
      });

      await useCase.execute('u1');

      expect(primeros[0]).toMatchObject({ temporadaId: null });
    });
  });

  describe('⛔ no abre el ciclo siguiente', () => {
    it('devuelve el ciclo cerrado sin crear ninguno', async () => {
      // Este es el fallo que se vio en pruebas: bastaba con abrir el expediente para que al
      // participante se le creara un ciclo nuevo. Devolver el cerrado hace que el sync lo vea
      // FINALIZADO y no toque nada, que es lo correcto — un ciclo cerrado está congelado.
      const { useCase, primeros, nuevosCiclos } = fakeRepo({
        findVisibleByParticipante: () => Promise.resolve(unProceso('p-viejo', 'FINALIZADO')),
      });

      const devuelto = await useCase.execute('u1');

      expect(devuelto).toMatchObject({ id: 'p-viejo', estado: 'FINALIZADO' });
      expect(primeros).toHaveLength(0);
      expect(nuevosCiclos).toHaveLength(0);
    });
  });

  describe('a quién no se le abre nada', () => {
    it('no le abre proceso al staff de USE', async () => {
      const { useCase, primeros } = fakeRepo({
        findParticipanteParaProceso: () => Promise.resolve({ ...PARTICIPANTE, roleCode: 'ASESOR' }),
      });

      await expect(useCase.execute('u1')).resolves.toBeNull();
      expect(primeros).toHaveLength(0);
    });

    it.each([
      ['programa', { programId: null }],
      ['opción', { optionProgramId: null }],
      ['país', { countryId: null }],
    ])('no abre proceso, y avisa, si le falta el %s', async (falta, campoNulo) => {
      const { useCase, primeros } = fakeRepo({
        findParticipanteParaProceso: () => Promise.resolve({ ...PARTICIPANTE, ...campoNulo }),
      });

      await expect(useCase.execute('u1')).resolves.toBeNull();
      expect(primeros).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(falta));
    });

    it('no abre proceso, y avisa, si el usuario no existe', async () => {
      const { useCase, primeros } = fakeRepo({
        findParticipanteParaProceso: () => Promise.resolve(null),
      });

      await expect(useCase.execute('fantasma')).resolves.toBeNull();
      expect(primeros).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no existe'));
    });
  });
});
