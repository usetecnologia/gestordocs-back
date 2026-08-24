import { Logger } from '@nestjs/common';
import type { Document } from '@modules/document/domain/document.entity';
import type { IDocumentRepository } from '@modules/document/domain/document.repository';
import type { EnsureProcesoInicialUseCase } from '@modules/proceso/application/use-cases/ensure-proceso-inicial.use-case';
import { Proceso } from '@modules/proceso/domain/proceso.entity';
import type {
  ExistingUserDocument,
  IUserDocumentsRepository,
} from '../../domain/user-documents.repository';
import { SyncUserDocumentsUseCase } from './sync-user-documents.use-case';

/**
 * El sync es el punto por donde pasan los siete caminos que arman un expediente, así que un error
 * acá se multiplica por los 2970 participantes. Estos tests fijan su contrato después de acotarlo al
 * proceso (paso 6):
 *
 * - Un proceso FINALIZADO está congelado: nada automático lo altera.
 * - Trabaja dentro de UN proceso: no hereda ni copia nada de otro ciclo.
 * - Lo que el participante ya subió y sigue aplicando **no se toca**.
 * - Lo que dejó de aplicar se desactiva; nunca se borra.
 */

const CONTEXT = { sponsorCode: 'SP-A', programId: 'prog-1', countryId: 'pais-1' };

function proceso(estado: 'EN_PROCESO' | 'FINALIZADO' = 'EN_PROCESO'): Proceso {
  return new Proceso(
    'p1',
    'u1',
    'prog-1',
    'opt-1',
    'pais-1',
    'sp-a',
    null,
    estado,
    'DOCUMENTOS_INCOMPLETOS',
    estado === 'EN_PROCESO' ? true : null,
    new Date('2026-01-01'),
  );
}

/** Documento del catálogo exigido por uno o más sponsors. */
function docDeSponsor(id: string, links: Array<[string, string]>, status = true): Document {
  return {
    id,
    status,
    sponsors: links.map(([linkId, sponsorCode]) => ({
      id: linkId,
      sponsor: { code: sponsorCode },
    })),
  } as unknown as Document;
}

/** Documento general, sin sponsor. */
function docGeneral(id: string, status = true): Document {
  return { id, status, sponsors: [] } as unknown as Document;
}

function existente(
  id: string,
  target: { documentSponsorId?: string; documentId?: string },
  statusDocument = true,
): ExistingUserDocument {
  return {
    id,
    userId: 'u1',
    documentSponsorId: target.documentSponsorId ?? null,
    documentId: target.documentId ?? null,
    status: 'SUBIDO',
    statusDocument,
    updatedAt: new Date('2026-02-01'),
  };
}

function armar(opciones: {
  context?: typeof CONTEXT | null;
  proceso?: Proceso | null;
  documents?: Document[];
  existing?: ExistingUserDocument[];
}) {
  const creados: unknown[] = [];
  const vigencias: Array<{ id: string; statusDocument: boolean }> = [];
  const procesosConsultados: string[] = [];

  const userDocumentsRepo = {
    findUserApplicabilityContext: () =>
      Promise.resolve(opciones.context === undefined ? CONTEXT : opciones.context),
    findByProcesoId: (procesoId: string) => {
      procesosConsultados.push(procesoId);
      return Promise.resolve(opciones.existing ?? []);
    },
    createWithHistory: (data: unknown) => {
      creados.push(data);
      return Promise.resolve();
    },
    updateStatusDocument: (id: string, statusDocument: boolean) => {
      vigencias.push({ id, statusDocument });
      return Promise.resolve();
    },
  } as unknown as IUserDocumentsRepository;

  const documentRepo = {
    findApplicableForParticipant: () => Promise.resolve(opciones.documents ?? []),
  } as unknown as IDocumentRepository;

  const ensureProcesoInicial = {
    execute: () =>
      Promise.resolve(opciones.proceso === undefined ? proceso() : opciones.proceso),
  } as unknown as EnsureProcesoInicialUseCase;

  const useCase = new SyncUserDocumentsUseCase(
    userDocumentsRepo,
    documentRepo,
    ensureProcesoInicial,
  );
  return { useCase, creados, vigencias, procesosConsultados };
}

describe('SyncUserDocumentsUseCase', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cortes que dejan el expediente intacto', () => {
    it('no toca nada si el participante no tiene programa ni país', async () => {
      const { useCase, creados, vigencias, procesosConsultados } = armar({ context: null });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
      expect(vigencias).toHaveLength(0);
      expect(procesosConsultados).toHaveLength(0);
    });

    it('no toca nada si no se le pudo abrir un proceso', async () => {
      const { useCase, creados, vigencias } = armar({
        proceso: null,
        documents: [docGeneral('doc-1')],
      });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
      expect(vigencias).toHaveLength(0);
    });

    it('congela el expediente de un proceso FINALIZADO', async () => {
      // Ni un documento nuevo en el catálogo ni uno dado de baja pueden mover un ciclo cerrado.
      const { useCase, creados, vigencias, procesosConsultados } = armar({
        proceso: proceso('FINALIZADO'),
        documents: [docGeneral('doc-nuevo')],
        existing: [existente('ud1', { documentId: 'doc-viejo' })],
      });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
      expect(vigencias).toHaveLength(0);
      expect(procesosConsultados).toHaveLength(0);
    });
  });

  describe('dentro del proceso abierto', () => {
    it('consulta el expediente del proceso, no el del participante', async () => {
      const { useCase, procesosConsultados } = armar({ documents: [] });

      await useCase.execute('u1');

      expect(procesosConsultados).toEqual(['p1']);
    });

    it('crea los documentos que faltan colgados de ese proceso', async () => {
      const { useCase, creados } = armar({
        documents: [docGeneral('doc-1'), docDeSponsor('doc-2', [['link-a', 'SP-A']])],
      });

      await useCase.execute('u1');

      expect(creados).toEqual([
        { userId: 'u1', procesoId: 'p1', documentId: 'doc-1' },
        { userId: 'u1', procesoId: 'p1', documentSponsorId: 'link-a' },
      ]);
    });

    it('no toca lo que el participante ya tiene y sigue aplicando', async () => {
      const { useCase, creados, vigencias } = armar({
        documents: [docGeneral('doc-1')],
        existing: [existente('ud1', { documentId: 'doc-1' })],
      });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
      expect(vigencias).toHaveLength(0);
    });

    it('ignora el documento que no exige ningún sponsor del participante', async () => {
      const { useCase, creados } = armar({
        documents: [docDeSponsor('doc-2', [['link-b', 'SP-B']])],
      });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
    });

    it('no crea el documento que está dado de baja en el catálogo', async () => {
      const { useCase, creados } = armar({ documents: [docGeneral('doc-1', false)] });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
    });
  });

  describe('lo que dejó de aplicar', () => {
    it('desactiva el documento del sponsor anterior tras un cambio de sponsor', async () => {
      // El participante estaba con SP-B y pasó a SP-A: el vínculo viejo ya no le corresponde, el
      // nuevo nace en PENDIENTE. Nada se borra — la fila vieja queda inactiva con su historial.
      const { useCase, creados, vigencias } = armar({
        documents: [docDeSponsor('doc-2', [['link-a', 'SP-A'], ['link-b', 'SP-B']])],
        existing: [existente('ud-viejo', { documentSponsorId: 'link-b' })],
      });

      await useCase.execute('u1');

      expect(creados).toEqual([
        { userId: 'u1', procesoId: 'p1', documentSponsorId: 'link-a' },
      ]);
      expect(vigencias).toEqual([{ id: 'ud-viejo', statusDocument: false }]);
    });

    it('alinea la vigencia con el catálogo cuando el documento se da de baja', async () => {
      const { useCase, vigencias } = armar({
        documents: [docGeneral('doc-1', false)],
        existing: [existente('ud1', { documentId: 'doc-1' })],
      });

      await useCase.execute('u1');

      expect(vigencias).toEqual([{ id: 'ud1', statusDocument: false }]);
    });

    it('reactiva el documento que había quedado inactivo y volvió a aplicar', async () => {
      const { useCase, creados, vigencias } = armar({
        documents: [docGeneral('doc-1')],
        existing: [existente('ud1', { documentId: 'doc-1' }, false)],
      });

      await useCase.execute('u1');

      expect(creados).toHaveLength(0);
      expect(vigencias).toEqual([{ id: 'ud1', statusDocument: true }]);
    });

    it('no vuelve a desactivar una fila que ya estaba inactiva', async () => {
      const { useCase, vigencias } = armar({
        documents: [],
        existing: [existente('ud1', { documentId: 'doc-viejo' }, false)],
      });

      await useCase.execute('u1');

      expect(vigencias).toHaveLength(0);
    });

    it('no toca la fila que no apunta a ningún documento', async () => {
      // Hay 3 filas así en base. Sin puntero no hay con qué decidir si aplica, así que se dejan
      // quietas en vez de desactivarlas por descarte.
      const { useCase, vigencias } = armar({
        documents: [],
        existing: [existente('ud-huerfana', {})],
      });

      await useCase.execute('u1');

      expect(vigencias).toHaveLength(0);
    });
  });
});
