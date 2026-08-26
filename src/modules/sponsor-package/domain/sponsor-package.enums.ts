/**
 * Enums del dominio de los paquetes de descarga por sponsor. Los valores string son explícitos para
 * que coincidan uno a uno con los enums de Prisma.
 */

/** Cómo se deposita el paquete de un participante dentro del ZIP. */
export enum PackageStructure {
  /** Un único archivo con el nombre del participante, sin subcarpeta. Es el caso ASPIRE. */
  ARCHIVO_SUELTO = 'ARCHIVO_SUELTO',
  /** Una subcarpeta por participante con los archivos dentro. Es el caso de los otros cuatro. */
  CARPETA_POR_PARTICIPANTE = 'CARPETA_POR_PARTICIPANTE',
}

/** Cómo se produce un archivo de salida a partir de sus fuentes. */
export enum PackageOutputMode {
  /** Las fuentes se combinan en un solo PDF, en el orden configurado. */
  PDF_COMBINADO = 'PDF_COMBINADO',
  /**
   * La primera fuente con archivo se entrega tal cual, sin convertir a PDF. Es el caso del PHOTO
   * de CENET, que el sponsor pide como imagen.
   */
  ARCHIVO_ORIGINAL = 'ARCHIVO_ORIGINAL',
}

/** Qué hacer cuando una fuente no tiene archivo para ese participante. */
export enum PackageOnMissing {
  /** La fuente se cae y el archivo se arma con el resto. Es el comportamiento histórico. */
  OMITIR_FUENTE = 'OMITIR_FUENTE',
  /** El archivo entero no se genera. */
  OMITIR_ARCHIVO = 'OMITIR_ARCHIVO',
  /** El participante queda fuera del paquete, con motivo. */
  OMITIR_PARTICIPANTE = 'OMITIR_PARTICIPANTE',
}

/** Esquina de la página desde la que se miden los márgenes del sello. */
export enum PackageStampAnchor {
  BOTTOM_RIGHT = 'BOTTOM_RIGHT',
  BOTTOM_LEFT = 'BOTTOM_LEFT',
  TOP_RIGHT = 'TOP_RIGHT',
  TOP_LEFT = 'TOP_LEFT',
}
