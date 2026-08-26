/**
 * Plantillas de nombre de los paquetes. Un solo diccionario de tokens, para que la vista previa que
 * ve el admin y lo que termina escribiendo el motor sean lo mismo.
 */

export interface TemplateTokens {
  readonly dni: string;
  readonly apellidos: string;
  readonly nombres: string;
  readonly nombreCompleto: string;
  readonly sponsor: string;
  readonly programa: string;
  readonly pais: string;
}

/** Los tokens que una plantilla puede usar. Cualquier otro se rechaza al guardar la regla. */
export const TEMPLATE_TOKEN_NAMES: readonly (keyof TemplateTokens)[] = [
  'dni',
  'apellidos',
  'nombres',
  'nombreCompleto',
  'sponsor',
  'programa',
  'pais',
];

const TOKEN_PATTERN = /\{([a-zA-Z]+)\}/g;

/**
 * Deja el texto usable como nombre de carpeta o archivo dentro del ZIP.
 *
 * `/` y `\` son separadores de ruta: un programa llamado "WAT/USA" partiría la carpeta en dos
 * niveles sin que nadie lo pidiera. El resto de caracteres que Windows rechaza al extraer se
 * cambian también, porque un ZIP que no se puede descomprimir no le sirve a nadie.
 */
export function sanitizeSegment(value: string | null | undefined, fallback = ''): string {
  const limpio = (value ?? '').replace(/[\\/:*?"<>|]/g, '-').trim();
  return limpio || fallback;
}

/** Los tokens que usa una plantilla, en minúscula y sin repetir. Sirve para validarla. */
export function extractTokens(template: string): string[] {
  const encontrados = new Set<string>();
  for (const [, name] of template.matchAll(TOKEN_PATTERN)) {
    encontrados.add(name.toLowerCase());
  }
  return [...encontrados];
}

/** Tokens de la plantilla que no existen en el diccionario. Vacío = la plantilla es válida. */
export function findUnknownTokens(template: string): string[] {
  const conocidos = new Set(TEMPLATE_TOKEN_NAMES.map((t) => t.toLowerCase()));
  return extractTokens(template).filter((t) => !conocidos.has(t));
}

/**
 * Reemplaza los tokens por sus valores. El match es insensible a mayúsculas, así que `{PROGRAMA}` y
 * `{programa}` son lo mismo — las plantillas de agrupación se escriben en mayúscula por costumbre y
 * las de nombre en minúscula, y no tiene sentido que eso sea un error.
 *
 * El saneado se aplica **al valor de cada token**, nunca a la plantilla entera: así una `/` que
 * escribió el admin sigue siendo separador de carpeta, pero una `/` que viene en el nombre de un
 * programa o de una persona no puede partir la ruta.
 *
 * Un token desconocido se deja tal cual en el texto en vez de borrarse: es visible en la vista
 * previa y en el ZIP, y eso es más fácil de diagnosticar que un hueco silencioso.
 */
export function renderTemplate(template: string, tokens: TemplateTokens): string {
  const porNombre = new Map<string, string>(
    TEMPLATE_TOKEN_NAMES.map((name) => [name.toLowerCase(), tokens[name]]),
  );

  return template.replace(TOKEN_PATTERN, (original, name: string) => {
    const valor = porNombre.get(name.toLowerCase());
    return valor === undefined ? original : sanitizeSegment(valor);
  });
}
