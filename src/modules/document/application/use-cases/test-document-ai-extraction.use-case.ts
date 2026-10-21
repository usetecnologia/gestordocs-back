import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { detectFileType } from '@common/utils/file-type.util';
import { DocumentAiProfile } from '../../domain/document.enums';
import {
  AiFilePreparation,
  DOCUMENT_AI_EXTRACTOR_PORT,
  IDocumentAiExtractorPort,
} from '../../domain/ai/document-ai-extractor.port';
import type { PassportExtraction } from '../../domain/ai/passport-extraction';
import {
  PassportExtractionReport,
  buildPassportExtractionReport,
} from '../../domain/ai/passport-extraction-report';

/** Formatos que la IA acepta. HEIC/TIFF/BMP se rechazan antes de gastar una llamada. */
const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface TestDocumentAiExtractionInput {
  profile: DocumentAiProfile;
  instructions: string | null;
  file: { buffer: Buffer; originalname: string; size: number };
}

export interface TestDocumentAiExtractionResult {
  perfil: DocumentAiProfile;
  archivo: { nombre: string; tipo: string; tamano: number };
  duracionMs: number;
  preparacion: AiFilePreparation;
  reporte: PassportExtractionReport;
  /** Respuesta cruda de la IA, para depurar el prompt. */
  extraccion: PassportExtraction;
}

/**
 * Prueba del formulario de documentos: extrae los datos de un archivo de muestra con la
 * configuración que el administrador tiene en pantalla (aunque no esté guardada) y dice si se
 * obtuvieron bien. No persiste nada ni toca ningún documento de participante.
 */
@Injectable()
export class TestDocumentAiExtractionUseCase {
  constructor(
    @Inject(DOCUMENT_AI_EXTRACTOR_PORT) private readonly extractor: IDocumentAiExtractorPort,
  ) {}

  async execute(input: TestDocumentAiExtractionInput): Promise<TestDocumentAiExtractionResult> {
    const detected = detectFileType(input.file.buffer);
    if (!detected || !SUPPORTED_CONTENT_TYPES.includes(detected.contentType)) {
      throw new BadRequestException(
        'Formato no soportado. Sube una imagen JPG, PNG o WEBP, o un PDF.',
      );
    }

    const startedAt = Date.now();
    const { extraction: extraccion, preparacion } = await this.extractor.extractPassport(
      { buffer: input.file.buffer, contentType: detected.contentType, filename: input.file.originalname },
      input.instructions,
    );

    return {
      perfil: input.profile,
      archivo: { nombre: input.file.originalname, tipo: detected.contentType, tamano: input.file.size },
      duracionMs: Date.now() - startedAt,
      preparacion,
      reporte: buildPassportExtractionReport(extraccion),
      extraccion,
    };
  }
}
