import type { PassportExtraction } from './passport-extraction';

export interface AiExtractionSourceFile {
  buffer: Buffer;
  /** Tipo real del archivo, detectado por sus bytes. */
  contentType: string;
  filename: string;
}

/** Cómo se preparó el archivo antes de leerlo, para poder explicarlo en el resultado. */
export interface AiFilePreparation {
  totalPaginas: number;
  /** Página (desde 1) que se leyó como página de datos. */
  paginaUsada: number;
  /** Grados en sentido horario que se giró la página para enderezarla. */
  rotacionAplicada: 0 | 90 | 180 | 270;
  /** Lecturas hechas: 2 si la primera no superó los dígitos de control y se probó la orientación opuesta. */
  intentos: number;
  /** La primera lectura de la MRZ no superó la verificación y se releyó campo por campo. */
  mrzReleida: boolean;
}

export interface PassportExtractionOutput {
  extraction: PassportExtraction;
  preparacion: AiFilePreparation;
}

export interface IDocumentAiExtractorPort {
  /**
   * Transcribe el pasaporte. `additionalInstructions` son indicaciones del administrador: se
   * suman al prompt base pero no pueden cambiar el formato de salida.
   */
  extractPassport(
    file: AiExtractionSourceFile,
    additionalInstructions: string | null,
  ): Promise<PassportExtractionOutput>;
}

export const DOCUMENT_AI_EXTRACTOR_PORT = Symbol('DOCUMENT_AI_EXTRACTOR_PORT');
