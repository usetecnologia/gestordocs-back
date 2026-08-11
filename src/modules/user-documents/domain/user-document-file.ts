import { UserDocumentHistoryItem } from './user-documents.repository';

/**
 * URL del archivo vigente de un documento, leída de su historial.
 *
 * Antes cada revisión (aceptar/observar) buscaba el último historial con status "SUBIDO". Eso deja
 * fuera a los documentos ingresados por carga masiva: ese flujo crea el registro directamente en su
 * estado final (REVISADO, OBSERVADO, …) y nunca escribe una entrada "SUBIDO". Al revisarlos, la URL
 * se resolvía a null y el nuevo historial quedaba sin archivo — el documento perdía para siempre la
 * referencia a su PDF/imagen aunque el archivo siguiera intacto en S3.
 *
 * Se toma entonces el historial más reciente que tenga URL, sin importar con qué status se registró:
 * todos los caminos que escriben historial (subida, carga masiva, clonado por cambio de sponsor,
 * aceptar, observar) guardan ahí la URL del archivo vigente en ese momento, así que el más reciente
 * con URL es siempre el archivo actual.
 *
 * No asume ningún orden en `history`: se resuelve por `createdAt` para no depender de cómo lo haya
 * ordenado el repositorio que lo trajo.
 */
export function resolveCurrentFileUrl(
  history: UserDocumentHistoryItem[],
): string | null {
  const conArchivo = history.filter(
    (h): h is UserDocumentHistoryItem & { url: string } => !!h.url,
  );
  if (!conArchivo.length) return null;

  return conArchivo.reduce((masReciente, actual) =>
    actual.createdAt.getTime() >= masReciente.createdAt.getTime()
      ? actual
      : masReciente,
  ).url;
}
