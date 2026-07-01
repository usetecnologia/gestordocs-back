import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { MulterFile } from '../../domain/multer-file.interface';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const VALID_STATUSES = ['PENDIENTE', 'SUBIDO', 'EN_REVISION', 'OBSERVADO', 'REVISADO'] as const;
const UPLOAD_CONCURRENCY = 5;

function resolveStatus(input: string): string | null {
  const upper = input.trim().toUpperCase();
  return (VALID_STATUSES as readonly string[]).includes(upper) ? upper : null;
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

function parseFilename(originalname: string): { dni: string; siglasCode: string } | null {
  const lastDot = originalname.lastIndexOf('.');
  const nameWithoutExt = lastDot > -1 ? originalname.slice(0, lastDot) : originalname;
  const firstUnderscore = nameWithoutExt.indexOf('_');
  if (firstUnderscore === -1) return null;
  const dni = nameWithoutExt.slice(0, firstUnderscore);
  const siglasCode = nameWithoutExt.slice(firstUnderscore + 1);
  if (!dni || !siglasCode) return null;
  return { dni, siglasCode };
}

export interface BulkUploadSuccessItem {
  filename: string;
  dni: string;
  siglasCode: string;
  userId: string;
  documentId: string;
}

export interface BulkUploadErrorItem {
  filename: string;
  reason: string;
  dni?: string;
  siglasCode?: string;
}

export interface BulkUploadByFilenameResult {
  totalSuccess: number;
  totalErrors: number;
  successes: BulkUploadSuccessItem[];
  errors: BulkUploadErrorItem[];
}

@Injectable()
export class BulkUploadByFilenameUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT)
    private readonly userStatusPort: IUserStatusPort,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(
    statusInput: string,
    files: MulterFile[],
    createdById: string,
  ): Promise<BulkUploadByFilenameResult> {
    const status = resolveStatus(statusInput);
    if (!status) {
      throw new BadRequestException(
        `Estado no vinculado: "${statusInput}". Los valores válidos son: ${VALID_STATUSES.join(', ')}.`,
      );
    }

    const outcomes = await mapWithConcurrency(files, UPLOAD_CONCURRENCY, (file) =>
      this.processFile(file, status, createdById),
    );

    const successes: BulkUploadSuccessItem[] = [];
    const errors: BulkUploadErrorItem[] = [];
    for (const outcome of outcomes) {
      if (outcome.kind === 'success') {
        successes.push(outcome.item);
      } else {
        errors.push(outcome.item);
      }
    }

    const uniqueUserIds = [...new Set(successes.map((s) => s.userId))];
    await Promise.all(
      uniqueUserIds.map((userId) =>
        this.userStatusPort.updateStatus(userId, 'DOCUMENTOS_INCOMPLETOS', createdById),
      ),
    );

    return {
      totalSuccess: successes.length,
      totalErrors: errors.length,
      successes,
      errors,
    };
  }

  private async processFile(
    file: MulterFile,
    status: string,
    createdById: string,
  ): Promise<
    | { kind: 'success'; item: BulkUploadSuccessItem }
    | { kind: 'error'; item: BulkUploadErrorItem }
  > {
    const filename = file.originalname;

    if (file.size > MAX_FILE_SIZE) {
      return {
        kind: 'error',
        item: { filename, reason: 'El archivo supera el tamaño máximo permitido de 15 MB.' },
      };
    }

    const parsed = parseFilename(filename);
    if (!parsed) {
      return {
        kind: 'error',
        item: {
          filename,
          reason: 'Nombre de archivo inválido. Formato esperado: {dni}_{siglas}.{extension}.',
        },
      };
    }

    const { dni, siglasCode } = parsed;

    const [userId, documentId] = await Promise.all([
      this.userDocumentsRepo.findUserIdByDni(dni),
      this.userDocumentsRepo.findDocumentIdBySiglasCode(siglasCode),
    ]);

    if (!userId) {
      return {
        kind: 'error',
        item: { filename, reason: `Usuario con DNI "${dni}" no encontrado.`, dni, siglasCode },
      };
    }

    if (!documentId) {
      return {
        kind: 'error',
        item: { filename, reason: `Documento con siglas "${siglasCode}" no encontrado.`, dni, siglasCode },
      };
    }

    try {
      const { url } = await this.awsS3Service.uploadOne(file, 'user-documents/bulk');
      await this.userDocumentsRepo.upsertUserDocumentWithStatus({
        userId,
        documentId,
        status,
        url,
        createdById,
      });
      return { kind: 'success', item: { filename, dni, siglasCode, userId, documentId } };
    } catch {
      return {
        kind: 'error',
        item: { filename, reason: 'Error al subir el archivo al servidor.', dni, siglasCode },
      };
    }
  }
}
