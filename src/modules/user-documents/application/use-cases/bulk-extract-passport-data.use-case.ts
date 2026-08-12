import { Inject, Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as mime from 'mime-types';
import {
  IUserDocumentsRepository,
  PassportDocumentCandidate,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IPassportExtractorPort, PASSPORT_EXTRACTOR_PORT } from '../../domain/passport-extractor.port';
import {
  breaksRendering,
  detectFileType,
  normalizeContentType,
} from '@common/utils/file-type.util';
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
// Sin un tope explícito, una descarga que se queda colgada retiene uno de los
// EXTRACTION_CONCURRENCY workers indefinidamente y el batch nunca termina.
const DOWNLOAD_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Etiqueta "Observado por IA" — aplicada a toda observación generada automáticamente por este use case.
const OBSERVADO_POR_IA_ETIQUETA_ID = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';

/**
 * Cómo terminó la revisión de un pasaporte. Distinguir estos cuatro casos es el punto: antes
 * "observado = NO" mezclaba "el pasaporte está correcto" con "no se pudo ni evaluar", que son cosas
 * opuestas —la primera no requiere nada, la segunda requiere volver a intentarlo—, y ambas salían
 * iguales en el Excel.
 */
type PassportReviewOutcome =
  /** Evaluado, con problema, observación registrada correctamente. */
  | 'OBSERVADO'
  /** Evaluado, sin problemas. */
  | 'CORRECTO'
  /** No se pudo evaluar (descarga fallida, tipo no soportado, error de la IA). */
  | 'NO_EVALUADO'
  /** Evaluado y con problema, pero la observación NO se pudo guardar: requiere reintento. */
  | 'ERROR_AL_REGISTRAR';

const OUTCOME_LABEL: Record<PassportReviewOutcome, string> = {
  OBSERVADO: 'OBSERVADO',
  CORRECTO: 'CORRECTO',
  NO_EVALUADO: 'NO SE PUDO EVALUAR',
  ERROR_AL_REGISTRAR: 'ERROR AL REGISTRAR LA OBSERVACIÓN',
};

interface PassportReportRow {
  dni: string;
  estado: PassportReviewOutcome;
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
 * Procesa `items` con `limit` workers en paralelo. Ningún fallo individual interrumpe la corrida:
 * si `fn` lanza, `onItemError` decide con qué resultado se registra ese item y el worker sigue.
 *
 * Esto no es una precaución teórica. Cuando un `fn` lanzaba, el `Promise.all` rechazaba pero los
 * demás workers **no se detenían** (no hay cancelación): el batch "fallaba" hacia arriba —sin correo
 * ni Excel, perdiendo el trabajo de horas— mientras los otros workers seguían escribiendo
 * observaciones con el lock ya liberado, dejando la puerta abierta a una segunda corrida en paralelo
 * sobre las mismas filas.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onItemError: (item: T, error: unknown) => R,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      try {
        results[currentIndex] = await fn(item);
      } catch (err) {
        results[currentIndex] = onItemError(item, err);
      }
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
    // Índice de la primera fila del lote que todavía no se ha notificado: los correos de progreso
    // llevan solo su lote, no el acumulado.
    let pendingBatchStart = 0;
    let nextBatchThreshold = PROGRESS_BATCH_SIZE;

    const rows = await mapWithConcurrency(
      candidates,
      EXTRACTION_CONCURRENCY,
      async (candidate) => {
        const row = await this.processCandidate(candidate, reviewedById);
        processedRows.push(row);

        if (processedRows.length >= nextBatchThreshold) {
          const batchNumber = Math.ceil(processedRows.length / PROGRESS_BATCH_SIZE);
          const batchRows = processedRows.slice(pendingBatchStart);
          pendingBatchStart = processedRows.length;
          nextBatchThreshold += PROGRESS_BATCH_SIZE;
          // Fire-and-forget: no se espera para no frenar el procesamiento del resto de candidatos.
          // notifyAdmin ya atrapa sus propios errores, así que esto no genera rechazos sueltos.
          void this.notifyProgress(
            batchNumber,
            totalBatches,
            total,
            processedRows.length,
            batchRows,
          );
        }

        return row;
      },
      // Red de seguridad: processCandidate ya atrapa todo internamente, así que llegar aquí significa
      // un fallo inesperado en el propio andamiaje. Se registra como fila y la corrida continúa.
      (candidate, err) => {
        this.logger.error(
          `BulkExtractPassportData — fallo inesperado procesando el documento ${candidate.userDocumentId}.`,
          err as Error,
        );
        return {
          dni: '',
          estado: 'NO_EVALUADO' as const,
          motivo: `No se pudo evaluar: fallo inesperado (${err instanceof Error ? err.message : 'error desconocido'}).`,
          url: candidate.url,
        };
      },
    );

    const resumen = this.summarize(rows);
    this.logger.log(
      `BulkExtractPassportData — completado. Analizados: ${rows.length}, observados: ${resumen.observados}, ` +
        `correctos: ${resumen.correctos}, no evaluados: ${resumen.noEvaluados}, ` +
        `errores al registrar: ${resumen.erroresAlRegistrar}.`,
    );

    const buffer = await this.buildWorkbook(rows);

    await this.notifyAdmin(
      'Revisión masiva de pasaportes (IA) completada',
      [
        `Total analizados: ${rows.length}`,
        `Observados: ${resumen.observados}`,
        `Correctos: ${resumen.correctos}`,
        `No se pudieron evaluar: ${resumen.noEvaluados}`,
        `Con error al registrar la observación (requieren reintento): ${resumen.erroresAlRegistrar}`,
        '',
        'Este es el reporte FINAL, con todas las filas de la corrida.',
      ].join('\n'),
      [{ filename: REPORT_FILENAME, content: buffer }],
    );
  }

  private summarize(rows: PassportReportRow[]) {
    return {
      observados: rows.filter((r) => r.estado === 'OBSERVADO').length,
      correctos: rows.filter((r) => r.estado === 'CORRECTO').length,
      noEvaluados: rows.filter((r) => r.estado === 'NO_EVALUADO').length,
      erroresAlRegistrar: rows.filter((r) => r.estado === 'ERROR_AL_REGISTRAR').length,
    };
  }

  // El envío de correo nunca debe tumbar el resultado de la revisión — si falla, solo se loguea.
  private async notifyAdmin(subject: string, text: string, attachments?: SendMailAttachment[]): Promise<void> {
    try {
      await this.resendService.notifyAdmin(subject, text, attachments);
    } catch (err) {
      this.logger.error('BulkExtractPassportData — no se pudo notificar al admin por correo.', err as Error);
    }
  }

  /**
   * Correo de avance con **solo las filas de su lote**. Antes adjuntaba el acumulado completo, con
   * dos consecuencias: el adjunto crecía en cada envío hasta que el proveedor de correo podía
   * rechazarlo, y el último correo de progreso era indistinguible del reporte final —de hecho el
   * Excel que circuló del incidente del 4/8/2026 era un correo de progreso, no el reporte final, y
   * por eso le faltaban 9 participantes.
   */
  private async notifyProgress(
    batchNumber: number,
    totalBatches: number,
    total: number,
    processedSoFar: number,
    batchRows: PassportReportRow[],
  ): Promise<void> {
    const resumen = this.summarize(batchRows);
    const buffer = await this.buildWorkbook(batchRows);

    await this.notifyAdmin(
      `Revisión masiva de pasaportes (IA) — progreso (Lote ${batchNumber}/${totalBatches})`,
      [
        `Total participantes: ${total}`,
        `Lote: ${batchNumber}/${totalBatches}`,
        `Procesados hasta ahora: ${processedSoFar}/${total}`,
        '',
        `En ESTE lote (${batchRows.length} filas, las únicas que van adjuntas):`,
        `  Observados: ${resumen.observados}`,
        `  Correctos: ${resumen.correctos}`,
        `  No se pudieron evaluar: ${resumen.noEvaluados}`,
        `  Con error al registrar la observación: ${resumen.erroresAlRegistrar}`,
        '',
        'AVISO: este es un correo de PROGRESO y el adjunto contiene solo este lote.',
        'El reporte completo llega al final, con el asunto "completada".',
      ].join('\n'),
      [
        {
          filename: `revision-masiva-pasaporte-lote-${batchNumber}-de-${totalBatches}.xlsx`,
          content: buffer,
        },
      ],
    );
  }

  private async processCandidate(
    candidate: PassportDocumentCandidate,
    reviewedById: string,
  ): Promise<PassportReportRow> {
    // Dentro del try: era la única llamada que quedaba fuera, y un timeout de BD acá tumbaba la
    // corrida completa (ver mapWithConcurrency). El DNI es solo para el reporte, así que si no se
    // puede leer se sigue adelante con el resto de la evaluación.
    let dni = '';

    try {
      try {
        const participant = await this.userDocumentsRepo.findParticipantInfo(candidate.userId);
        dni = participant?.dni ?? '';
      } catch (err) {
        this.logger.warn(
          `BulkExtractPassportData — no se pudo leer el DNI del participante ${candidate.userId}: ` +
            `${(err as Error).message}. Se continúa sin él.`,
        );
      }

      const { buffer, contentType, filename, contentTypeMismatch } = await this.downloadFile(candidate.url);

      if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) {
        return {
          dni,
          estado: 'NO_EVALUADO',
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
          this.logger.error(
            `BulkExtractPassportData — no se pudo registrar la observación del documento ` +
              `${candidate.userDocumentId} (DNI ${dni || 's/d'}): ${(err as Error).message}`,
          );
          return {
            dni,
            estado: 'ERROR_AL_REGISTRAR',
            motivo: `${motivo} (No se pudo registrar la observación: ${(err as Error).message})`,
            url: candidate.url,
          };
        }
      }

      return {
        dni,
        estado: observado ? 'OBSERVADO' : 'CORRECTO',
        motivo,
        url: candidate.url,
      };
    } catch (err) {
      return {
        dni,
        estado: 'NO_EVALUADO',
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
    // El signal cubre toda la operación, incluida la lectura del body: sin él, una conexión que
    // acepta pero nunca envía datos deja al worker esperando para siempre.
    let response: Response;
    try {
      response = await fetch(fileUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error(
          `La descarga del archivo excedió el tiempo límite de ${DOWNLOAD_TIMEOUT_MS / 1000}s.`,
        );
      }
      throw err;
    }

    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`);
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error(
          `La lectura del archivo excedió el tiempo límite de ${DOWNLOAD_TIMEOUT_MS / 1000}s.`,
        );
      }
      throw err;
    }

    if (!buffer.length) {
      throw new Error('El archivo descargado está vacío.');
    }

    const rawFilename = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() ?? 'file');
    const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    const detectedFromBytes = detectFileType(buffer)?.contentType ?? null;
    // Se normaliza porque aguas abajo se compara contra SUPPORTED_CONTENT_TYPES: sin esto, un
    // "image/pjpeg" o un "IMAGE/JPEG" perfectamente legible se descartaría como no soportado.
    const contentType = normalizeContentType(
      detectedFromBytes ??
        (headerContentType && headerContentType !== 'application/octet-stream'
          ? headerContentType
          : mime.lookup(rawFilename) || 'application/octet-stream'),
    );

    // El navegador confía en el Content-Type que declara el servidor (S3), no en la extensión de
    // la URL, para decidir cómo renderizar el archivo. Si ese header dice "image/jpeg" pero los
    // bytes reales son, por ejemplo, un PDF, el archivo queda irreproducible como imagen aunque la
    // IA sí pueda leerlo — se reporta el mismatch para forzar la corrección del archivo subido.
    //
    // Solo se reporta cuando el desajuste impide realmente ver el archivo (ver `breaksRendering`):
    // entre imágenes el navegador acierta por sniffing y observar por eso sería un falso positivo.
    // `application/octet-stream` no se considera una declaración incorrecta sino la ausencia de
    // declaración, y ya se descarta antes al elegir el contentType.
    const contentTypeMismatch: ContentTypeMismatch | null =
      detectedFromBytes &&
      headerContentType &&
      normalizeContentType(headerContentType) !== 'application/octet-stream' &&
      breaksRendering(headerContentType, detectedFromBytes)
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

    // Se mantiene OBSERVADO (SI/NO) para no romper a quien ya lee esa columna, y se agrega ESTADO,
    // que es la que distingue "correcto" de "no se pudo evaluar" y de "no se pudo registrar".
    const headerRow = sheet.addRow(['DNI', 'OBSERVADO', 'ESTADO', 'MOTIVO', 'URL DOCUMENTO']);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });

    for (const row of rows) {
      sheet.addRow([
        row.dni,
        row.estado === 'OBSERVADO' ? 'SI' : 'NO',
        OUTCOME_LABEL[row.estado],
        row.motivo,
        row.url,
      ]);
    }

    sheet.columns.forEach((col, index) => {
      col.width = index === 3 || index === 4 ? 60 : index === 2 ? 34 : 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
