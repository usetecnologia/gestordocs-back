import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as mime from 'mime-types';
import {
  IUserDocumentsRepository,
  PassportDocumentCandidate,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IPassportExtractorPort, PASSPORT_EXTRACTOR_PORT } from '../../domain/passport-extractor.port';

// TODO: cantidad fija de participantes para la primera versión de pruebas — a futuro debería
// venir como parámetro del request (o cubrir todos los pendientes de revisar).
const PASSPORT_BULK_LIMIT = 10;
const EXTRACTION_CONCURRENCY = 3;
const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface PassportReportRow {
  dni: string;
  nombres: string;
  apellidos: string;
  fechaEmision: string;
  fechaNacimiento: string;
  url: string;
  observaciones: string;
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
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(PASSPORT_EXTRACTOR_PORT)
    private readonly passportExtractor: IPassportExtractorPort,
  ) {}

  async execute(): Promise<Buffer> {
    const candidates = await this.userDocumentsRepo.findLatestPassportDocuments(PASSPORT_BULK_LIMIT);
    if (!candidates.length) {
      throw new NotFoundException('No se encontraron pasaportes disponibles para analizar.');
    }

    const rows = await mapWithConcurrency(candidates, EXTRACTION_CONCURRENCY, (candidate) =>
      this.processCandidate(candidate),
    );

    console.log('[BulkExtractPassportDataUseCase] filas:', JSON.stringify(rows, null, 2));

    return this.buildWorkbook(rows);
  }

  private async processCandidate(candidate: PassportDocumentCandidate): Promise<PassportReportRow> {
    const participant = await this.userDocumentsRepo.findParticipantInfo(candidate.userId);
    const dni = participant?.dni ?? '';
    const nombres = [participant?.firstname, participant?.middlename].filter(Boolean).join(' ');
    const apellidos = [participant?.lastfathername, participant?.lastmothername].filter(Boolean).join(' ');

    try {
      const { buffer, contentType, filename } = await this.downloadFile(candidate.url);

      if (!SUPPORTED_CONTENT_TYPES.includes(contentType)) {
        return {
          dni,
          nombres,
          apellidos,
          fechaEmision: '',
          fechaNacimiento: '',
          url: candidate.url,
          observaciones: `Tipo de archivo no soportado: "${contentType}".`,
        };
      }

      const passportData = await this.passportExtractor.extract({ buffer, contentType, filename });

      return {
        dni,
        nombres,
        apellidos,
        fechaEmision: passportData.fechaEmision ?? '',
        fechaNacimiento: passportData.fechaNacimiento ?? '',
        url: candidate.url,
        observaciones: passportData.observaciones ?? '',
      };
    } catch (err) {
      return {
        dni,
        nombres,
        apellidos,
        fechaEmision: '',
        fechaNacimiento: '',
        url: candidate.url,
        observaciones: `Error al analizar el documento: ${(err as Error).message}`,
      };
    }
  }

  private async downloadFile(
    fileUrl: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
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
    const headerContentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const contentType =
      detectContentTypeFromBytes(buffer) ??
      (headerContentType && headerContentType !== 'application/octet-stream'
        ? headerContentType
        : mime.lookup(rawFilename) || 'application/octet-stream');

    // Si la extensión real del archivo no coincide con el content-type detectado (p. ej. un PDF
    // guardado como .jpg), se corrige para que el nombre enviado a OpenAI sea coherente.
    const detectedExt = mime.extension(contentType);
    const filename =
      detectedExt && !rawFilename.toLowerCase().endsWith(`.${detectedExt}`)
        ? `${rawFilename.replace(/\.[^.]+$/, '')}.${detectedExt}`
        : rawFilename;

    return { buffer, contentType, filename };
  }

  private async buildWorkbook(rows: PassportReportRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Revisión Masiva Pasaporte');

    const headerRow = sheet.addRow([
      'DNI',
      'NOMBRES',
      'APELLIDOS',
      'FECHA EMISIÓN',
      'FECHA NACIMIENTO',
      'URL DOCUMENTO',
      'OBSERVACIONES',
    ]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    });

    for (const row of rows) {
      sheet.addRow([
        row.dni,
        row.nombres,
        row.apellidos,
        row.fechaEmision,
        row.fechaNacimiento,
        row.url,
        row.observaciones,
      ]);
    }

    sheet.columns.forEach((col, index) => {
      col.width = index === 5 ? 60 : index === 6 ? 40 : 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
