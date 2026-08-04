import { Inject, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as mime from 'mime-types';
import {
  IUserDocumentsRepository,
  PassportDocumentCandidate,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IPassportExtractorPort, PASSPORT_EXTRACTOR_PORT } from '../../domain/passport-extractor.port';
import { PassportData } from '../../domain/passport-data';
import { ResendService } from '@shared/resend/resend.service';
import type { SendMailAttachment } from '@shared/resend/interfaces/send-mail.interface';
import { TerminarRevisionUseCase } from './terminar-revision.use-case';

const EXTRACTION_CONCURRENCY = 3;
const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MINIMUM_ADULT_AGE = 18;
const REPORT_FILENAME = 'revision-masiva-pasaporte.xlsx';
// Cada cuántos participantes procesados se envía un correo de avance al admin, con el Excel
// acumulado hasta ese punto — visibilidad del progreso en corridas largas sin esperar el final.
const PROGRESS_BATCH_SIZE = 100;
// La descarga del archivo puede fallar por problemas de red transitorios (timeout, conexión
// reseteada, throttling puntual de S3) aunque el archivo exista y sea accesible — se reintenta
// antes de darla por perdida. DOWNLOAD_RETRY_ATTEMPTS incluye el intento inicial.
const DOWNLOAD_RETRY_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Etiqueta "Observado por IA" — aplicada a toda observación generada automáticamente por este use case.
const OBSERVADO_POR_IA_ETIQUETA_ID = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';

interface PassportReportRow {
  dni: string;
  observado: 'SI' | 'NO';
  motivo: string;
  url: string;
}

interface ContentTypeMismatch {
  declared: string;
  detected: string;
}

/**
 * No se puede confiar en "tipoDocumento" por sí solo: el modelo transcribe literalmente lo que ve
 * impreso, así que una plantilla/placeholder en blanco con el texto "PASAPORTE" impreso (sin foto,
 * MRZ, fechas ni nombres) hace que la IA devuelva tipoDocumento="PASAPORTE" aunque no exista ningún
 * dato real de pasaporte. Por eso se exige evidencia sustantiva: una MRZ real (2-3 líneas, no un
 * fragmento corto) o varios campos biográficos genuinos extraídos.
 */
function isRecognizedAsPassport(data: PassportData): boolean {
  const mrzLength = data.mrz?.replace(/\s/g, '').length ?? 0;
  if (mrzLength >= 20) return true;

  const camposBiograficos = [
    data.numeroPasaporte,
    data.fechaNacimiento,
    data.fechaEmision,
    data.nombres,
    data.apellidos,
    data.codigoPaisEmisor,
  ].filter(Boolean).length;

  return camposBiograficos >= 3;
}

function parseIsoDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Fecha exacta en la que se cumplen `years` años desde `birthDate` (el día del cumpleaños N). */
function getBirthdayAfterYears(birthDate: Date, years: number): Date {
  const birthday = new Date(birthDate.getTime());
  birthday.setUTCFullYear(birthDate.getUTCFullYear() + years);
  return birthday;
}

function buildPassportReasons(data: PassportData): string[] {
  if (!isRecognizedAsPassport(data)) {
    return ['El documento analizado no corresponde a un pasaporte.'];
  }

  if (data.fechaNacimiento && data.fechaEmision) {
    const fechaNacimiento = parseIsoDate(data.fechaNacimiento);
    const fechaEmision = parseIsoDate(data.fechaEmision);
    if (fechaNacimiento && fechaEmision) {
      // Debe ser MAYOR de 18 años (no cumplir 18 exactamente) al emitirse el pasaporte: si la
      // emisión ocurre el mismo día del 18° cumpleaños o antes, todavía no es mayor de edad.
      const decimoOctavoCumpleanos = getBirthdayAfterYears(fechaNacimiento, MINIMUM_ADULT_AGE);
      if (fechaEmision.getTime() <= decimoOctavoCumpleanos.getTime()) {
        const mismoDia = fechaEmision.getTime() === decimoOctavoCumpleanos.getTime();
        const motivo = mismoDia
          ? `El participante cumplía exactamente ${MINIMUM_ADULT_AGE} años el mismo día en que se emitió el ` +
            `pasaporte (nacimiento: ${data.fechaNacimiento}, emisión: ${data.fechaEmision}) — debe ser mayor ` +
            `de ${MINIMUM_ADULT_AGE} años, no cumplir esa edad justo ese día.`
          : `El participante era menor de edad al momento de emitirse el pasaporte ` +
            `(nacimiento: ${data.fechaNacimiento}, emisión: ${data.fechaEmision}).`;
        return [motivo];
      }
    }
  }

  return [];
}

/**
 * Algunos documentos quedan guardados en S3 con un Content-Type/extensión que no corresponde
 * a su contenido real (p. ej. un PDF servido como "image/jpeg" con extensión .jpg) — se detecta
 * el formato real por su firma de bytes en vez de confiar en esos metadatos.
 */
function detectContentTypeFromBytes(bytes: Buffer): string | null {
  if (bytes.length < 4) return null;
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

@Injectable()
export class BulkExtractPassportDataUseCase {
  private readonly logger = new Logger(BulkExtractPassportDataUseCase.name);

  // Lock en memoria — evita que dos corridas se pisen sobre los mismos documentos (misma
  // limitación que BulkInfoParticipantsUseCase: solo funciona porque la app corre como un único
  // proceso Node; si se escala a varias instancias hay que mover el lock a la base de datos).
  private isRunning = false;

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(PASSPORT_EXTRACTOR_PORT)
    private readonly passportExtractor: IPassportExtractorPort,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
    private readonly resendService: ResendService,
  ) {}

  // Expuesto para que el controller pueda responder de inmediato "ya hay una revisión en curso"
  // sin lanzar (y luego descartar) otra ejecución del batch.
  isSyncInProgress(): boolean {
    return this.isRunning;
  }

  // Corre en background (el controller no espera esta promesa) — revisar TODOS los pasaportes
  // pendientes puede tardar bastante (descarga + llamada a OpenAI por cada uno), y cualquier
  // proxy/gateway delante del server cortaría la conexión mucho antes de que termine. Por eso el
  // resultado no vuelve por HTTP: se loguea y se notifica al admin por correo con el Excel adjunto.
  async execute(reviewedById: string): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('BulkExtractPassportData — ya hay una revisión en curso, se omite esta ejecución.');
      return;
    }
    this.isRunning = true;

    try {
      await this.runReview(reviewedById);
    } finally {
      this.isRunning = false;
    }
  }

  private async runReview(reviewedById: string): Promise<void> {
    let candidates: PassportDocumentCandidate[];
    try {
      candidates = await this.userDocumentsRepo.findAllPassportDocuments();
    } catch (err) {
      this.logger.error('BulkExtractPassportData — no se pudo obtener la lista de pasaportes, batch abortado.', err as Error);
      await this.notifyAdmin(
        'Revisión masiva de pasaportes (IA) FALLÓ',
        `No se pudo iniciar la revisión: ${err instanceof Error ? err.message : 'error desconocido'}.`,
      );
      return;
    }

    if (!candidates.length) {
      this.logger.log('BulkExtractPassportData — no se encontraron pasaportes disponibles para analizar.');
      await this.notifyAdmin(
        'Revisión masiva de pasaportes (IA) — sin resultados',
        'No se encontraron pasaportes disponibles para analizar.',
      );
      return;
    }

    const total = candidates.length;
    const totalBatches = Math.ceil(total / PROGRESS_BATCH_SIZE);
    this.logger.log(`BulkExtractPassportData — ${total} pasaportes a analizar.`);

    const processedRows: PassportReportRow[] = [];
    let nextBatchThreshold = PROGRESS_BATCH_SIZE;

    const rows = await mapWithConcurrency(candidates, EXTRACTION_CONCURRENCY, async (candidate) => {
      const row = await this.processCandidate(candidate, reviewedById);
      processedRows.push(row);

      if (processedRows.length >= nextBatchThreshold) {
        const batchNumber = Math.ceil(processedRows.length / PROGRESS_BATCH_SIZE);
        const snapshot = [...processedRows];
        nextBatchThreshold += PROGRESS_BATCH_SIZE;
        // Fire-and-forget: no se espera para no frenar el procesamiento del resto de candidatos.
        // notifyAdmin ya atrapa sus propios errores, así que esto no genera rechazos sueltos.
        void this.notifyProgress(batchNumber, totalBatches, total, snapshot);
      }

      return row;
    });

    const observadosCount = rows.filter((r) => r.observado === 'SI').length;
    this.logger.log(
      `BulkExtractPassportData — completado. Analizados: ${rows.length}, observados: ${observadosCount}, ` +
        `no observados: ${rows.length - observadosCount}.`,
    );

    const buffer = await this.buildWorkbook(rows);

    await this.notifyAdmin(
      'Revisión masiva de pasaportes (IA) completada',
      [
        `Total analizados: ${rows.length}`,
        `Observados: ${observadosCount}`,
        `No observados: ${rows.length - observadosCount}`,
      ].join('\n'),
      [{ filename: REPORT_FILENAME, content: buffer }],
    );
  }

  // El envío de correo nunca debe tumbar el resultado de la revisión — si falla, solo se loguea.
  private async notifyAdmin(subject: string, text: string, attachments?: SendMailAttachment[]): Promise<void> {
    try {
      await this.resendService.notifyAdmin(subject, text, attachments);
    } catch (err) {
      this.logger.error('BulkExtractPassportData — no se pudo notificar al admin por correo.', err as Error);
    }
  }

  private async notifyProgress(
    batchNumber: number,
    totalBatches: number,
    total: number,
    rowsSoFar: PassportReportRow[],
  ): Promise<void> {
    const observadosCount = rowsSoFar.filter((r) => r.observado === 'SI').length;
    const buffer = await this.buildWorkbook(rowsSoFar);

    await this.notifyAdmin(
      `Revisión masiva de pasaportes (IA) — progreso (Lote ${batchNumber}/${totalBatches})`,
      [
        `Total participantes: ${total}`,
        `Lote: ${batchNumber}/${totalBatches}`,
        `Procesados hasta ahora: ${rowsSoFar.length}`,
        `Observados: ${observadosCount}`,
        `No observados: ${rowsSoFar.length - observadosCount}`,
      ].join('\n'),
      [{ filename: REPORT_FILENAME, content: buffer }],
    );
  }

  private async processCandidate(
    candidate: PassportDocumentCandidate,
    reviewedById: string,
  ): Promise<PassportReportRow> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(candidate.userId);
    const dni = participant?.dni ?? '';

    try {
      const { buffer, contentType, filename, contentTypeMismatch } = await this.downloadFile(candidate.url);

      if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) {
        return {
          dni,
          observado: 'NO',
          motivo: `No se pudo evaluar: tipo de archivo no soportado "${contentType}".`,
          url: candidate.url,
        };
      }

      const passportData = await this.passportExtractor.extract({ buffer, contentType, filename });
      const reasons = buildPassportReasons(passportData);

      if (contentTypeMismatch) {
        reasons.push(
          `El archivo está guardado con un tipo de contenido declarado ("${contentTypeMismatch.declared}") ` +
            `que no corresponde a su contenido real ("${contentTypeMismatch.detected}"), lo que puede impedir ` +
            'su visualización en el sistema.',
        );
      }

      const observado = reasons.length > 0;
      const motivo = reasons.join(' ');

      if (observado) {
        try {
          await this.observeCandidate(candidate, motivo, reviewedById);
        } catch (err) {
          return {
            dni,
            observado: 'SI',
            motivo: `${motivo} (No se pudo registrar la observación: ${(err as Error).message})`,
            url: candidate.url,
          };
        }
      }

      return {
        dni,
        observado: observado ? 'SI' : 'NO',
        motivo,
        url: candidate.url,
      };
    } catch (err) {
      return {
        dni,
        observado: 'NO',
        motivo: `No se pudo evaluar: ${(err as Error).message}`,
        url: candidate.url,
      };
    }
  }

  /**
   * Se llama a userDocumentsRepo.observarDocument directamente (en vez de ObservarDocumentUseCase)
   * para forzar que la URL guardada en el nuevo historial sea exactamente candidate.url — la misma
   * que se descargó y analizó. ObservarDocumentUseCase deriva la URL buscando la última entrada del
   * historial con status "SUBIDO", lo cual queda en null si ese documento nunca tuvo una entrada con
   * ese status exacto (p. ej. algunos ingresados por carga masiva), perdiendo la referencia al
   * archivo observado.
   */
  private async observeCandidate(
    candidate: PassportDocumentCandidate,
    motivo: string,
    reviewedById: string,
  ): Promise<void> {
    await this.userDocumentsRepo.observarDocument({
      userDocumentId: candidate.userDocumentId,
      observation: motivo,
      etiquetaIds: [OBSERVADO_POR_IA_ETIQUETA_ID],
      reviewedById,
      url: candidate.url,
    });
    await this.terminarRevisionUseCase.execute(candidate.userId, reviewedById);
  }

  private async downloadFile(fileUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
    contentTypeMismatch: ContentTypeMismatch | null;
  }> {
    let lastError: Error;
    for (let attempt = 1; attempt <= DOWNLOAD_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.downloadFileOnce(fileUrl);
      } catch (err) {
        lastError = err as Error;
        if (attempt < DOWNLOAD_RETRY_ATTEMPTS) {
          this.logger.warn(
            `BulkExtractPassportData — fallo al descargar (intento ${attempt}/${DOWNLOAD_RETRY_ATTEMPTS}): ` +
              `${lastError.message}. Reintentando...`,
          );
          await sleep(DOWNLOAD_RETRY_DELAY_MS * attempt);
        }
      }
    }
    throw lastError!;
  }

  private async downloadFileOnce(fileUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
    contentTypeMismatch: ContentTypeMismatch | null;
  }> {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      throw new Error('El archivo descargado está vacío.');
    }

    const rawFilename = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() ?? 'file');
    const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    const detectedFromBytes = detectContentTypeFromBytes(buffer);
    const contentType =
      detectedFromBytes ??
      (headerContentType && headerContentType !== 'application/octet-stream'
        ? headerContentType
        : mime.lookup(rawFilename) || 'application/octet-stream');

    // El navegador confía en el Content-Type que declara el servidor (S3), no en la extensión de
    // la URL, para decidir cómo renderizar el archivo. Si ese header dice "image/jpeg" pero los
    // bytes reales son, por ejemplo, un PDF, el archivo queda irreproducible como imagen aunque la
    // IA sí pueda leerlo — se reporta el mismatch para forzar la corrección del archivo subido.
    const contentTypeMismatch: ContentTypeMismatch | null =
      detectedFromBytes &&
      headerContentType &&
      headerContentType !== 'application/octet-stream' &&
      headerContentType !== detectedFromBytes
        ? { declared: headerContentType, detected: detectedFromBytes }
        : null;

    // Si la extensión real del archivo no coincide con el content-type detectado (p. ej. un PDF
    // guardado como .jpg), se corrige para que el nombre enviado a OpenAI sea coherente.
    const detectedExt = mime.extension(contentType);
    const filename =
      detectedExt && !rawFilename.toLowerCase().endsWith(`.${detectedExt}`)
        ? `${rawFilename.replace(/\.[^.]+$/, '')}.${detectedExt}`
        : rawFilename;

    return { buffer, contentType, filename, contentTypeMismatch };
  }

  private async buildWorkbook(rows: PassportReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Revisión Masiva Pasaporte');

    const headerRow = sheet.addRow(['DNI', 'OBSERVADO', 'MOTIVO', 'URL DOCUMENTO']);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });

    for (const row of rows) {
      sheet.addRow([row.dni, row.observado, row.motivo, row.url]);
    }

    sheet.columns.forEach((col, index) => {
      col.width = index === 2 ? 60 : index === 3 ? 60 : 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
