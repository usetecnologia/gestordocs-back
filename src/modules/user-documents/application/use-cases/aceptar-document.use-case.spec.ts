import { NotFoundException } from '@nestjs/common';
import { AceptarDocumentUseCase } from './aceptar-document.use-case';
import type {
  AceptarDocumentData,
  IUserDocumentsRepository,
  UserDocumentHistoryItem,
  UserDocumentWithHistory,
} from '../../domain/user-documents.repository';

/**
 * Regresión real (participante 70627745, 04/08/2026): al aceptar un pasaporte que había entrado por
 * carga masiva, el historial nuevo se guardó con url = null y el documento quedó sin archivo visible
 * en la aplicación. El archivo nunca se perdió en S3 — se perdió la referencia.
 */

function historial(
  partial: Partial<UserDocumentHistoryItem> = {},
): UserDocumentHistoryItem {
  return {
    id: 'h1',
    userDocumentsId: 'ud1',
    status: 'REVISADO',
    url: null,
    observation: null,
    etiquetas: [],
    files: [],
    createdById: null,
    createdBy: null,
    createdAt: new Date('2026-07-01T23:19:13Z'),
    updatedAt: new Date('2026-07-01T23:19:13Z'),
    ...partial,
  };
}

function repoConHistorial(history: UserDocumentHistoryItem[]) {
  const aceptados: AceptarDocumentData[] = [];
  const userDoc = { id: 'ud1', history } as UserDocumentWithHistory;
  const repo = {
    findByIdWithHistory: jest.fn().mockResolvedValue(userDoc),
    aceptarDocument: jest.fn((data: AceptarDocumentData) => {
      aceptados.push(data);
      return Promise.resolve();
    }),
  } as unknown as IUserDocumentsRepository;

  return { repo, aceptados };
}

describe('AceptarDocumentUseCase', () => {
  it('conserva la URL de un documento de carga masiva (sin historial SUBIDO)', async () => {
    const { repo, aceptados } = repoConHistorial([
      historial({ status: 'REVISADO', url: 'https://s3/bulk/pasaporte.pdf' }),
      historial({
        status: 'OBSERVADO',
        url: 'https://s3/bulk/pasaporte.pdf',
        createdAt: new Date('2026-08-04T21:34:53Z'),
      }),
    ]);

    await new AceptarDocumentUseCase(repo).execute('ud1', 'revisor-1');

    expect(aceptados).toHaveLength(1);
    expect(aceptados[0].url).toBe('https://s3/bulk/pasaporte.pdf');
  });

  it('usa el último archivo subido cuando el participante reemplazó el documento', async () => {
    const { repo, aceptados } = repoConHistorial([
      historial({
        status: 'SUBIDO',
        url: 'https://s3/viejo.pdf',
        createdAt: new Date('2026-07-13T22:31:03Z'),
      }),
      historial({
        status: 'SUBIDO',
        url: 'https://s3/nuevo.pdf',
        createdAt: new Date('2026-07-16T13:36:47Z'),
      }),
    ]);

    await new AceptarDocumentUseCase(repo).execute('ud1', 'revisor-1');

    expect(aceptados[0].url).toBe('https://s3/nuevo.pdf');
  });

  it('deja la URL en null solo si el documento nunca tuvo archivo', async () => {
    const { repo, aceptados } = repoConHistorial([
      historial({ status: 'PENDIENTE', url: null }),
    ]);

    await new AceptarDocumentUseCase(repo).execute('ud1', 'revisor-1');

    expect(aceptados[0].url).toBeNull();
  });

  it('lanza NotFoundException si el documento no existe', async () => {
    const aceptarDocument = jest.fn();
    const repo = {
      findByIdWithHistory: jest.fn().mockResolvedValue(null),
      aceptarDocument,
    } as unknown as IUserDocumentsRepository;

    await expect(
      new AceptarDocumentUseCase(repo).execute('inexistente', 'revisor-1'),
    ).rejects.toThrow(NotFoundException);
    expect(aceptarDocument).not.toHaveBeenCalled();
  });
});
