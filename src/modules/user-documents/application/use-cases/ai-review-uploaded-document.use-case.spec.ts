jest.mock('@config/envs', () => ({ envs: { OPENAI_PASSPORT_MODEL: 'modelo-test' } }));
jest.mock('@modules/document/domain/ai/passport-review-decision', () => ({ decidePassportReview: jest.fn() }));
jest.mock('@modules/document/domain/ai/passport-extraction-report', () => ({
  buildPassportExtractionReport: jest.fn(() => ({ resumen: 'ok' })),
}));

import { decidePassportReview } from '@modules/document/domain/ai/passport-review-decision';
import { AiReviewUploadedDocumentUseCase } from './ai-review-uploaded-document.use-case';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const INPUT = { userDocumentId: 'ud-1', file: { buffer: JPEG, originalname: 'pasaporte.jpg' }, fileUrl: 'https://s3/x.jpg' };

function setup(overrides: { aiEnabled?: boolean; status?: string; aiUser?: string | null; extractError?: Error } = {}) {
  const calls: string[] = [];
  const aiReviewRepo = {
    findTarget: jest.fn().mockResolvedValue({ userDocumentId: 'ud-1', userId: 'u-1', aiEnabled: overrides.aiEnabled ?? true, aiInstructions: null }),
    findUserIdByUsername: jest.fn().mockResolvedValue(overrides.aiUser === undefined ? 'ia-user' : overrides.aiUser),
    findParticipantRegistry: jest.fn().mockResolvedValue({ dni: '1', nombres: 'A', apellidos: 'B', nacimiento: '2000-01-01' }),
    findEtiquetaIdByName: jest.fn().mockResolvedValue('label-ia'),
    save: jest.fn().mockImplementation((d: { decision: string }) => { calls.push(`save:${d.decision}`); return Promise.resolve(); }),
    findLatestByUserId: jest.fn(),
  };
  const userDocumentsRepo = {
    observarDocument: jest.fn().mockImplementation(() => { calls.push('observar'); return Promise.resolve(); }),
  };
  const userStatusPort = {
    getStatus: jest.fn().mockResolvedValue(overrides.status ?? 'DOCUMENTOS_SUBIDOS'),
    updateStatus: jest.fn().mockImplementation((_u: string, s: string) => { calls.push(`estado:${s}`); return Promise.resolve(); }),
  };
  const extractor = {
    extractPassport: overrides.extractError
      ? jest.fn().mockRejectedValue(overrides.extractError)
      : jest.fn().mockResolvedValue({ extraction: {}, preparacion: {} }),
  };
  const aceptar = { execute: jest.fn().mockImplementation(() => { calls.push('aceptar'); return Promise.resolve(); }) };
  const terminar = { execute: jest.fn().mockImplementation((_u: string, _by: string, suppress: boolean) => { calls.push(`terminar:${suppress}`); return Promise.resolve(); }) };

  const useCase = new AiReviewUploadedDocumentUseCase(
    aiReviewRepo as never,
    userDocumentsRepo as never,
    userStatusPort as never,
    extractor as never,
    aceptar as never,
    terminar as never,
  );
  return { useCase, calls, aiReviewRepo, terminar };
}

describe('AiReviewUploadedDocumentUseCase', () => {
  beforeEach(() => jest.mocked(decidePassportReview).mockReset());

  it('aprueba con el flujo de un revisor: comenzar → aprobar → terminar sin correo', async () => {
    jest.mocked(decidePassportReview).mockReturnValue({ decision: 'APROBAR', motivos: ['ok'], observacion: null } as never);
    const { useCase, calls } = setup();
    await useCase.execute(INPUT);
    expect(calls).toEqual(['estado:EN_REVISION', 'aceptar', 'save:APROBADO', 'terminar:true']);
  });

  it('observa con la etiqueta de IA', async () => {
    jest.mocked(decidePassportReview).mockReturnValue({ decision: 'OBSERVAR', motivos: ['menor'], observacion: 'texto' } as never);
    const { useCase, calls } = setup();
    await useCase.execute(INPUT);
    expect(calls).toEqual(['estado:EN_REVISION', 'observar', 'save:OBSERVADO', 'terminar:true']);
  });

  it('si es dudoso no aprueba ni observa, pero igual termina la revisión', async () => {
    jest.mocked(decidePassportReview).mockReturnValue({ decision: 'REVISION_MANUAL', motivos: ['dudoso'], observacion: null } as never);
    const { useCase, calls } = setup();
    await useCase.execute(INPUT);
    expect(calls).toEqual(['estado:EN_REVISION', 'save:REVISION_MANUAL', 'terminar:true']);
  });

  it('si la IA falla, registra el error y termina la revisión para no dejarlo bloqueado', async () => {
    const { useCase, calls } = setup({ extractError: new Error('timeout') });
    await useCase.execute(INPUT);
    expect(calls).toEqual(['estado:EN_REVISION', 'save:ERROR', 'terminar:true']);
  });

  it('no hace nada si el documento no tiene la IA activada', async () => {
    const { useCase, calls } = setup({ aiEnabled: false });
    await useCase.execute(INPUT);
    expect(calls).toEqual([]);
  });

  it('no interviene si una persona ya está revisando al participante', async () => {
    const { useCase, calls } = setup({ status: 'EN_REVISION' });
    await useCase.execute(INPUT);
    expect(calls).toEqual([]);
  });

  it('no hace nada si no existe el usuario de la IA', async () => {
    const { useCase, calls } = setup({ aiUser: null });
    await useCase.execute(INPUT);
    expect(calls).toEqual([]);
  });
});
