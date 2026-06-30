import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { MulterFile } from '../../domain/multer-file.interface';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const VALID_STATUSES = ['PENDIENTE', 'SUBIDO', 'EN_REVISION', 'OBSERVADO', 'REVISADO'] as const;

function resolveStatus(input: string): string | null {
  const upper = input.trim().toUpperCase();
  return (VALID_STATUSES as readonly string[]).includes(upper) ? upper : null;
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

    const successes: BulkUploadSuccessItem[] = [];
    const errors: BulkUploadErrorItem[] = [];

    for (const file of files) {
      const filename = file.originalname;

      if (file.size > MAX_FILE_SIZE) {
        errors.push({ filename, reason: 'El archivo supera el tamaño máximo permitido de 15 MB.' });
        continue;
      }

      const parsed = parseFilename(filename);
      if (!parsed) {
        errors.push({ filename, reason: 'Nombre de archivo inválido. Formato esperado: {dni}_{siglas}.{extension}.' });
        continue;
      }

      const { dni, siglasCode } = parsed;

      const userId = await this.userDocumentsRepo.findUserIdByDni(dni);
      if (!userId) {
        errors.push({ filename, reason: `Usuario con DNI "${dni}" no encontrado.`, dni, siglasCode });
        continue;
      }

      const documentId = await this.userDocumentsRepo.findDocumentIdBySiglasCode(siglasCode);
      if (!documentId) {
        errors.push({ filename, reason: `Documento con siglas "${siglasCode}" no encontrado.`, dni, siglasCode });
        continue;
      }

      try {
        const { url } = await this.awsS3Service.uploadOne(file, 'user-documents/bulk');
        await this.userDocumentsRepo.upsertUserDocumentWithStatus({ userId, documentId, status, url, createdById });
        successes.push({ filename, dni, siglasCode, userId, documentId });
      } catch {
        errors.push({ filename, reason: 'Error al subir el archivo al servidor.', dni, siglasCode });
      }
    }

    return {
      totalSuccess: successes.length,
      totalErrors: errors.length,
      successes,
      errors,
    };
  }
}
