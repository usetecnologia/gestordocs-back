import { resolveCurrentFileUrl } from './user-document-file';
import type { UserDocumentHistoryItem } from './user-documents.repository';

/**
 * Regresión: los documentos ingresados por carga masiva se crean directamente en REVISADO y nunca
 * tienen una entrada "SUBIDO" en su historial. La resolución anterior (último historial con status
 * "SUBIDO") devolvía null para ellos, y al aceptarlos u observarlos el nuevo historial quedaba sin
 * URL: el documento perdía la referencia a su archivo aunque el archivo siguiera en S3.
 */

function historial(
  partial: Partial<UserDocumentHistoryItem> = {},
): UserDocumentHistoryItem {
  return {
    id: 'h1',
    userDocumentsId: 'ud1',
    status: 'SUBIDO',
    url: null,
    observation: null,
    etiquetas: [],
    files: [],
    createdById: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

describe('resolveCurrentFileUrl', () => {
  it('devuelve la URL de un documento de carga masiva, que nunca tuvo un historial SUBIDO', () => {
    const history = [
      historial({ status: 'REVISADO', url: 'https://s3/bulk/pasaporte.pdf' }),
    ];

    expect(resolveCurrentFileUrl(history)).toBe(
      'https://s3/bulk/pasaporte.pdf',
    );
  });

  it('toma el archivo más reciente cuando el participante volvió a subir el documento', () => {
    const history = [
      historial({
        status: 'SUBIDO',
        url: 'https://s3/viejo.pdf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      historial({
        status: 'OBSERVADO',
        url: 'https://s3/viejo.pdf',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
      historial({
        status: 'SUBIDO',
        url: 'https://s3/nuevo.pdf',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      }),
    ];

    expect(resolveCurrentFileUrl(history)).toBe('https://s3/nuevo.pdf');
  });

  it('ignora los historiales sin archivo, como el PENDIENTE que crea el sync', () => {
    const history = [
      historial({
        status: 'PENDIENTE',
        url: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      historial({
        status: 'SUBIDO',
        url: 'https://s3/doc.pdf',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
      historial({
        status: 'REVISADO',
        url: null,
        createdAt: new Date('2026-01-03T00:00:00Z'),
      }),
    ];

    expect(resolveCurrentFileUrl(history)).toBe('https://s3/doc.pdf');
  });

  it('no depende del orden en que venga el historial', () => {
    const history = [
      historial({
        status: 'SUBIDO',
        url: 'https://s3/nuevo.pdf',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      }),
      historial({
        status: 'SUBIDO',
        url: 'https://s3/viejo.pdf',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ];

    expect(resolveCurrentFileUrl(history)).toBe('https://s3/nuevo.pdf');
  });

  it('devuelve null si el documento realmente no tiene ningún archivo', () => {
    expect(
      resolveCurrentFileUrl([historial({ status: 'PENDIENTE', url: null })]),
    ).toBeNull();
    expect(resolveCurrentFileUrl([])).toBeNull();
  });
});
