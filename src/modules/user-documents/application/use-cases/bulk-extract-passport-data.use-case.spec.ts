import ExcelJS from 'exceljs';
import { BulkExtractPassportDataUseCase } from './bulk-extract-passport-data.use-case';
import type {
  IUserDocumentsRepository,
  PassportDocumentCandidate,
} from '../../domain/user-documents.repository';
import type { IPassportExtractorPort } from '../../domain/passport-extractor.port';
import type { PassportData } from '../../domain/passport-data';
import type { TerminarRevisionUseCase } from './terminar-revision.use-case';
import type { ResendService } from '@shared/resend/resend.service';
import type { SendMailAttachment } from '@shared/resend/interfaces/send-mail.interface';

/**
 * Robustez del batch de revisión masiva (incidente del 4/8/2026). Lo que se protege acá es que la
 * corrida **siempre llegue al final y siempre notifique**: antes, un fallo suelto —un timeout de BD
 * al leer el DNI, por ejemplo— hacía que `Promise.all` rechazara, el controller se lo tragaba en su
 * `.catch(() => {})` y se perdían horas de trabajo sin correo ni Excel, mientras los otros workers
 * seguían escribiendo observaciones con el lock ya liberado.
 */

const REVIEWER_ID = 'reviewer-uuid';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

interface CorreoEnviado {
  subject: string;
  text: string;
  attachments?: SendMailAttachment[];
}

function candidato(n: number): PassportDocumentCandidate {
  return {
    userId: `user-${n}`,
    userDocumentId: `doc-${n}`,
    status: 'REVISADO',
    url: `https://bucket.s3.amazonaws.com/user-documents/bulk/file-${n}.jpg`,
    updatedAt: new Date('2026-07-01T23:17:51Z'),
  };
}

/** Pasaporte válido de un adulto: no genera observación. */
function pasaporteCorrecto(): PassportData {
  return {
    tipoDocumento: 'PASAPORTE',
    numeroPasaporte: '123456789',
    codigoPaisEmisor: 'PER',
    paisEmisor: 'PERU',
    apellidos: 'ALVAREZ',
    nombres: 'ABIGAIL',
    nacionalidad: 'PERUANA',
    sexo: 'F',
    fechaNacimiento: '1995-05-20',
    lugarNacimiento: 'LIMA',
    fechaEmision: '2024-03-15',
    fechaVencimiento: '2034-03-15',
    autoridadEmisora: 'MIGRACIONES',
    mrz: 'P<PERALVAREZ<<ABIGAIL<<<<<<<<<<<<<<<<<<<<<<<<',
  } as PassportData;
}

/** Menor de edad al emitirse: genera observación. */
function pasaporteDeMenor(): PassportData {
  return {
    ...pasaporteCorrecto(),
    fechaNacimiento: '2010-05-20',
    fechaEmision: '2024-03-15',
  };
}

function setup(options: {
  candidates: PassportDocumentCandidate[];
  extract?: jest.Mock;
  findParticipantInfo?: jest.Mock;
  observarDocument?: jest.Mock;
  fetchImpl?: jest.Mock;
}) {
  const correos: CorreoEnviado[] = [];

  const findAllPassportDocuments = jest
    .fn()
    .mockResolvedValue(options.candidates);

  const repo = {
    findAllPassportDocuments,
    findParticipantInfo:
      options.findParticipantInfo ??
      jest.fn((userId: string) =>
        Promise.resolve({ dni: `dni-${userId.replace('user-', '')}` }),
      ),
    observarDocument:
      options.observarDocument ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as IUserDocumentsRepository;

  const extractor = {
    extract:
      options.extract ?? jest.fn().mockResolvedValue(pasaporteCorrecto()),
  } as unknown as IPassportExtractorPort;

  const terminarRevision = {
    execute: jest.fn().mockResolvedValue(undefined),
  } as unknown as TerminarRevisionUseCase;

  const resend = {
    notifyAdmin: jest.fn(
      (subject: string, text: string, attachments?: SendMailAttachment[]) => {
        correos.push({ subject, text, attachments });
        return Promise.resolve();
      },
    ),
  } as unknown as ResendService;

  global.fetch =
    options.fetchImpl ??
    jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: () => Promise.resolve(JPEG_BYTES.buffer.slice(0)),
    });

  const useCase = new BulkExtractPassportDataUseCase(
    repo,
    extractor,
    terminarRevision,
    resend,
  );

  return {
    useCase,
    repo,
    extractor,
    terminarRevision,
    resend,
    correos,
    findAllPassportDocuments,
  };
}

/** Texto de una celda; las que no son texto/número no interesan para estas comprobaciones. */
function celda(row: ExcelJS.Row, index: number): string {
  const value = row.getCell(index).value;
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

/** Filas de datos del Excel adjunto, sin la cabecera. */
async function filasDelAdjunto(
  attachment: SendMailAttachment,
): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(attachment.content as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const filas: Record<string, string>[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    filas.push({
      dni: celda(row, 1),
      observado: celda(row, 2),
      estado: celda(row, 3),
      motivo: celda(row, 4),
    });
  });
  return filas;
}

const correoFinal = (correos: CorreoEnviado[]) =>
  correos.find((c) => c.subject.includes('completada'));

describe('BulkExtractPassportDataUseCase — robustez del batch', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('completa la corrida y notifica aunque falle la lectura del DNI (el fallo que la tumbaba)', async () => {
    const findParticipantInfo = jest
      .fn()
      .mockRejectedValueOnce(
        new Error('Connection lost: The server closed the connection'),
      )
      .mockImplementation((userId: string) =>
        Promise.resolve({ dni: `dni-${userId.replace('user-', '')}` }),
      );

    const { useCase, correos } = setup({
      candidates: [candidato(1), candidato(2), candidato(3)],
      findParticipantInfo,
    });

    await expect(useCase.execute(REVIEWER_ID)).resolves.toBeUndefined();

    const final = correoFinal(correos);
    expect(final).toBeDefined();
    expect(final!.text).toContain('Total analizados: 3');

    const filas = await filasDelAdjunto(final!.attachments![0]);
    expect(filas).toHaveLength(3);
    // El documento se evaluó igual; lo único que se perdió fue el DNI en el reporte.
    expect(filas.filter((f) => f.estado === 'CORRECTO')).toHaveLength(3);
    expect(filas.filter((f) => f.dni === '')).toHaveLength(1);
  });

  it('libera el lock al terminar, incluso si la corrida tuvo fallos', async () => {
    const { useCase } = setup({
      candidates: [candidato(1)],
      findParticipantInfo: jest.fn().mockRejectedValue(new Error('BD caída')),
    });

    expect(useCase.isSyncInProgress()).toBe(false);
    await useCase.execute(REVIEWER_ID);
    expect(useCase.isSyncInProgress()).toBe(false);
  });

  it('distingue CORRECTO de NO SE PUDO EVALUAR en vez de reportar ambos como no observados', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: () => Promise.resolve(JPEG_BYTES.buffer.slice(0)),
      })
      .mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
      });

    const { useCase, correos } = setup({
      candidates: [candidato(1), candidato(2)],
      fetchImpl: fetchImpl,
    });

    await useCase.execute(REVIEWER_ID);

    const final = correoFinal(correos)!;
    const filas = await filasDelAdjunto(final.attachments![0]);
    const estados = filas.map((f) => f.estado).sort();

    expect(estados).toEqual(['CORRECTO', 'NO SE PUDO EVALUAR']);
    // Las dos siguen saliendo como OBSERVADO = NO, pero ya no son indistinguibles.
    expect(filas.every((f) => f.observado === 'NO')).toBe(true);
    expect(final.text).toContain('Correctos: 1');
    expect(final.text).toContain('No se pudieron evaluar: 1');
  }, 15000);

  it('marca ERROR AL REGISTRAR cuando la observación no se pudo guardar', async () => {
    const { useCase, correos } = setup({
      candidates: [candidato(1)],
      extract: jest.fn().mockResolvedValue(pasaporteDeMenor()),
      observarDocument: jest
        .fn()
        .mockRejectedValue(
          new Error('The provided value for the column is too long'),
        ),
    });

    await useCase.execute(REVIEWER_ID);

    const final = correoFinal(correos)!;
    const filas = await filasDelAdjunto(final.attachments![0]);

    expect(filas[0].estado).toBe('ERROR AL REGISTRAR LA OBSERVACIÓN');
    expect(filas[0].observado).toBe('NO');
    expect(filas[0].motivo).toContain('menor de edad');
    expect(final.text).toContain('requieren reintento): 1');
  });

  it('observa al menor de edad y sigue con el resto', async () => {
    const observarDocument = jest.fn().mockResolvedValue(undefined);
    const { useCase, correos } = setup({
      candidates: [candidato(1), candidato(2)],
      extract: jest
        .fn()
        .mockResolvedValueOnce(pasaporteDeMenor())
        .mockResolvedValue(pasaporteCorrecto()),
      observarDocument,
    });

    await useCase.execute(REVIEWER_ID);

    expect(observarDocument).toHaveBeenCalledTimes(1);
    const final = correoFinal(correos)!;
    expect(final.text).toContain('Observados: 1');
    expect(final.text).toContain('Correctos: 1');
  });

  it('un fallo de la IA no detiene a los demás candidatos', async () => {
    const { useCase, correos } = setup({
      candidates: [candidato(1), candidato(2), candidato(3)],
      extract: jest
        .fn()
        .mockRejectedValueOnce(new Error('Error al consultar OpenAI'))
        .mockResolvedValue(pasaporteCorrecto()),
    });

    await useCase.execute(REVIEWER_ID);

    const final = correoFinal(correos)!;
    const filas = await filasDelAdjunto(final.attachments![0]);
    expect(filas).toHaveLength(3);
    expect(filas.filter((f) => f.estado === 'NO SE PUDO EVALUAR')).toHaveLength(
      1,
    );
    expect(filas.filter((f) => f.estado === 'CORRECTO')).toHaveLength(2);
  });

  it('reporta el timeout de descarga en vez de quedarse colgado', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';

    const { useCase, correos } = setup({
      candidates: [candidato(1)],
      fetchImpl: jest.fn().mockRejectedValue(timeoutError),
    });

    await useCase.execute(REVIEWER_ID);

    const final = correoFinal(correos)!;
    const filas = await filasDelAdjunto(final.attachments![0]);
    expect(filas[0].estado).toBe('NO SE PUDO EVALUAR');
    expect(filas[0].motivo).toContain('excedió el tiempo límite');
  }, 15000);

  it('el correo de progreso adjunta solo su lote, no el acumulado', async () => {
    const candidates = Array.from({ length: 150 }, (_, i) => candidato(i + 1));
    const { useCase, correos } = setup({ candidates });

    await useCase.execute(REVIEWER_ID);
    // notifyProgress es fire-and-forget: se le da un tick para que termine.
    await new Promise((resolve) => setImmediate(resolve));

    const progreso = correos.find((c) => c.subject.includes('progreso'));
    expect(progreso).toBeDefined();
    expect(progreso!.attachments![0].filename).toBe(
      'revision-masiva-pasaporte-lote-1-de-2.xlsx',
    );

    const filasLote = await filasDelAdjunto(progreso!.attachments![0]);
    expect(filasLote).toHaveLength(100);
    expect(progreso!.text).toContain('Procesados hasta ahora: 100/150');
    expect(progreso!.text).toContain('correo de PROGRESO');

    // El reporte final sí lleva todas las filas.
    const filasFinal = await filasDelAdjunto(
      correoFinal(correos)!.attachments![0],
    );
    expect(filasFinal).toHaveLength(150);
  }, 30000);

  it('no arranca una segunda corrida mientras hay una en curso', async () => {
    let resolveExtract: (data: PassportData) => void = () => {};
    const extract = jest.fn(
      () => new Promise<PassportData>((resolve) => (resolveExtract = resolve)),
    );

    const { useCase, findAllPassportDocuments } = setup({
      candidates: [candidato(1)],
      extract: extract,
    });

    const primera = useCase.execute(REVIEWER_ID);
    await new Promise((resolve) => setImmediate(resolve));
    expect(useCase.isSyncInProgress()).toBe(true);

    await useCase.execute(REVIEWER_ID);
    expect(findAllPassportDocuments).toHaveBeenCalledTimes(1);

    resolveExtract(pasaporteCorrecto());
    await primera;
    expect(useCase.isSyncInProgress()).toBe(false);
  });
});
