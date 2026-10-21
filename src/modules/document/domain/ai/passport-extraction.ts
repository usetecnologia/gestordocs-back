/**
 * Lo que la IA transcribe de un pasaporte. Es una TRANSCRIPCIÓN, no un veredicto: la IA no decide
 * si el documento es aceptable; eso lo hace el código a partir de estos datos.
 *
 * La zona visual (VIZ) y la MRZ se devuelven por separado y sin reconciliar, para que el código
 * pueda compararlas y verificar los dígitos de control de la MRZ.
 */

export type AiFieldConfidence = 'ALTA' | 'MEDIA' | 'BAJA';

export interface ExtractedTextField {
  valor: string | null;
  confianza: AiFieldConfidence | null;
}

export interface ExtractedDateField {
  /** Texto tal cual aparece impreso, p. ej. "12 ENE/JAN 2019". */
  textoOriginal: string | null;
  /** Normalizada a YYYY-MM-DD, o null si algún componente no se lee con certeza. */
  valor: string | null;
  confianza: AiFieldConfidence | null;
}

export type ExtractedFileKind =
  | 'PASAPORTE'
  | 'OTRO_DOCUMENTO_IDENTIDAD'
  | 'PLANTILLA_EN_BLANCO'
  | 'NO_RELACIONADO';

export type ExtractedFileOrigin =
  | 'ESCANEO'
  | 'FOTO_DEL_DOCUMENTO'
  | 'FOTO_DE_PANTALLA'
  | 'CAPTURA_DE_PANTALLA'
  | 'FOTOCOPIA'
  | 'DESCONOCIDO';

export type ExtractedQualityIssue =
  | 'BORROSA'
  | 'REFLEJOS'
  | 'RECORTADA'
  | 'ROTADA'
  | 'BAJA_RESOLUCION'
  | 'OSCURA'
  | 'OBSTRUIDA';

export interface PassportVizFields {
  tipoDocumento: ExtractedTextField;
  codigoPaisEmisor: ExtractedTextField;
  paisEmisor: ExtractedTextField;
  numeroPasaporte: ExtractedTextField;
  apellidos: ExtractedTextField;
  nombres: ExtractedTextField;
  nacionalidad: ExtractedTextField;
  sexo: ExtractedTextField;
  lugarNacimiento: ExtractedTextField;
  autoridadEmisora: ExtractedTextField;
  numeroPersonal: ExtractedTextField;
  fechaNacimiento: ExtractedDateField;
  fechaEmision: ExtractedDateField;
  fechaVencimiento: ExtractedDateField;
}

export interface PassportExtraction {
  clasificacion: {
    tipo: ExtractedFileKind;
    /** Qué es el archivo, en una frase, sobre todo cuando no es un pasaporte. */
    descripcion: string | null;
    paginaDatosVisible: boolean;
    /** Página del PDF donde está la página de datos (1 para imágenes). */
    paginaDatos: number | null;
  };
  calidad: {
    legibilidad: 'BUENA' | 'REGULAR' | 'MALA';
    origen: ExtractedFileOrigin;
    problemas: ExtractedQualityIssue[];
  };
  viz: PassportVizFields;
  mrz: {
    /** Líneas en bruto, carácter por carácter. "?" marca un carácter ilegible. */
    lineas: string[];
    confianza: AiFieldConfidence | null;
  };
  fotoTitularPresente: boolean;
  firmaPresente: boolean;
  /** Indicios visibles de alteración, descritos sin concluir si es fraude. */
  alteraciones: string[];
  observaciones: string | null;
}
