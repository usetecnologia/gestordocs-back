/**
 * Lectura y verificación de la MRZ de un pasaporte (formato TD3, ICAO Doc 9303 parte 4):
 * dos líneas de 44 caracteres.
 *
 * Es la única parte del pasaporte con verificación incorporada: los dígitos de control permiten
 * saber si la IA transcribió bien el número, el nacimiento y el vencimiento sin depender de que
 * el modelo "acierte". Se implementa aquí y no con una librería porque es un algoritmo corto,
 * estable desde hace décadas, y el dominio no admite dependencias externas.
 */

export const TD3_LINE_LENGTH = 44;

export type MrzCheckField =
  | 'numeroPasaporte'
  | 'fechaNacimiento'
  | 'fechaVencimiento'
  | 'numeroPersonal'
  | 'compuesto';

export interface MrzCheckResult {
  campo: MrzCheckField;
  valido: boolean;
}

export interface Td3Fields {
  tipoDocumento: string;
  codigoPaisEmisor: string;
  apellidos: string;
  nombres: string;
  numeroPasaporte: string;
  nacionalidad: string;
  /** YYYY-MM-DD, o null si los 6 dígitos no forman una fecha. */
  fechaNacimiento: string | null;
  sexo: string;
  fechaVencimiento: string | null;
  numeroPersonal: string;
}

export type MrzReadResult =
  | { estado: 'AUSENTE' }
  | { estado: 'FORMATO_INVALIDO'; motivo: string }
  | {
      estado: 'LEIDA';
      valida: boolean;
      checks: MrzCheckResult[];
      campos: Td3Fields;
      /** La IA contó mal los "<" y se corrigió la longitud antes de verificar. */
      rellenoAjustado: boolean;
      /** Las líneas tal como se verificaron (con el relleno ya ajustado). */
      lineas: [string, string];
      /**
       * La línea 1 no tiene dígitos de control, así que se le aplican controles de forma. Si no
       * los supera, sus datos (país, apellidos, nombres) no se usan.
       */
      linea1Confiable: boolean;
      motivoLinea1: string | null;
    };

const WEIGHTS = [7, 3, 1];

function charValue(char: string): number | null {
  if (char === '<') return 0;
  if (char >= '0' && char <= '9') return char.charCodeAt(0) - 48;
  if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 55;
  return null;
}

/** Dígito de control ICAO: suma ponderada 7-3-1 módulo 10. `null` si hay caracteres ilegibles. */
export function computeCheckDigit(value: string): number | null {
  let sum = 0;
  for (let i = 0; i < value.length; i++) {
    const v = charValue(value[i]);
    if (v === null) return null;
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function checkDigitMatches(value: string, digit: string): boolean {
  const expected = computeCheckDigit(value);
  if (expected === null) return false;
  // El dígito del número personal puede venir como "<" cuando el campo está vacío.
  if (digit === '<') return expected === 0 && /^<*$/.test(value);
  return String(expected) === digit;
}

/**
 * YYMMDD → YYYY-MM-DD. La MRZ no trae el siglo: el nacimiento nunca es futuro, así que un año
 * mayor que el actual es del siglo pasado; el vencimiento siempre se toma en el siglo actual.
 */
export function mrzDateToIso(yymmdd: string, kind: 'nacimiento' | 'vencimiento', today: Date): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const currentYy = today.getUTCFullYear() % 100;
  const century = kind === 'nacimiento' && yy > currentYy ? 1900 : 2000;
  const year = century + yy;

  const date = new Date(Date.UTC(year, mm - 1, dd));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
  if (!isRealDate) return null;

  return `${year}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

const MIN_PERSONAL_NUMBER_LENGTH = 5;

/**
 * Controles de forma de la línea 1, que no tiene dígitos de control. Detectan los errores de
 * transcripción vistos en la evaluación: una línea corrida ("P<PRIOS..." en vez de
 * "P<PERRIOS...") y la falta del "<<" que separa apellidos de nombres.
 */
function checkLine1(l1: string, l2: string): string | null {
  if (!l1.startsWith('P')) return 'La línea 1 no empieza con "P", como corresponde a un pasaporte.';
  const issuer = l1.slice(2, 5);
  const nationality = l2.slice(10, 13);
  if (!/^[A-Z<]{3}$/.test(issuer) || issuer !== nationality) {
    return `El código de país de la línea 1 ("${issuer}") no coincide con el de la línea 2 ("${nationality}"): la línea 1 se leyó corrida.`;
  }
  // Se mira antes del relleno final, que siempre es una tira de "<" y daría un falso "<<".
  if (!l1.slice(5).replace(/<+$/, '').includes('<<')) {
    return 'En la línea 1 falta el "<<" que separa los apellidos de los nombres.';
  }
  return null;
}

function cleanName(value: string): string {
  return value.replace(/<+/g, ' ').trim();
}

function normalizeLine(line: string): string {
  return line.toUpperCase().replace(/\s+/g, '');
}

/**
 * Los modelos cuentan mal los rellenos "<<<<": es el error de transcripción más común de la MRZ.
 * Si a una línea le sobran o faltan caracteres, se alarga o acorta su tramo de "<" más largo
 * hasta los 44. Es seguro porque el resultado igual tiene que pasar los dígitos de control:
 * un ajuste equivocado los hace fallar en vez de esconder el error.
 */
function fitFillerToLength(line: string): string {
  const delta = TD3_LINE_LENGTH - line.length;
  if (delta === 0) return line;

  const runs = [...line.matchAll(/<{2,}/g)];
  if (runs.length === 0) return line;
  const longest = runs.reduce((a, b) => (b[0].length > a[0].length ? b : a));
  const newLength = longest[0].length + delta;
  if (newLength < 1) return line;

  const start = longest.index;
  return line.slice(0, start) + '<'.repeat(newLength) + line.slice(start + longest[0].length);
}

export function readTd3Mrz(rawLines: string[], today: Date = new Date()): MrzReadResult {
  const lines = rawLines.map(normalizeLine).filter((l) => l.length > 0);
  if (lines.length === 0) return { estado: 'AUSENTE' };

  if (lines.length !== 2) {
    return {
      estado: 'FORMATO_INVALIDO',
      motivo: `Un pasaporte tiene 2 líneas de MRZ y se leyeron ${lines.length}.`,
    };
  }
  const [raw1, raw2] = lines;
  const l1 = fitFillerToLength(raw1);
  const l2 = fitFillerToLength(raw2);
  if (l1.length !== TD3_LINE_LENGTH || l2.length !== TD3_LINE_LENGTH) {
    return {
      estado: 'FORMATO_INVALIDO',
      motivo:
        `Cada línea de la MRZ debe tener ${TD3_LINE_LENGTH} caracteres y se leyeron ` +
        `${raw1.length} y ${raw2.length}. Probablemente la IA omitió o agregó caracteres.`,
    };
  }
  const rellenoAjustado = l1 !== raw1 || l2 !== raw2;

  const numero = l2.slice(0, 9);
  const nacimiento = l2.slice(13, 19);
  const vencimiento = l2.slice(21, 27);
  const personal = l2.slice(28, 42);
  const compuesto = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);

  const checks: MrzCheckResult[] = [
    { campo: 'numeroPasaporte', valido: checkDigitMatches(numero, l2[9]) },
    { campo: 'fechaNacimiento', valido: checkDigitMatches(nacimiento, l2[19]) },
    { campo: 'fechaVencimiento', valido: checkDigitMatches(vencimiento, l2[27]) },
    { campo: 'numeroPersonal', valido: checkDigitMatches(personal, l2[42]) },
    { campo: 'compuesto', valido: checkDigitMatches(compuesto, l2[43]) },
  ];

  const [apellidos = '', ...resto] = l1.slice(5).split('<<');
  const motivoLinea1 = checkLine1(l1, l2);
  const personalNumber = cleanName(personal);

  return {
    estado: 'LEIDA',
    valida: checks.every((c) => c.valido),
    checks,
    rellenoAjustado,
    lineas: [l1, l2],
    linea1Confiable: motivoLinea1 === null,
    motivoLinea1,
    campos: {
      tipoDocumento: cleanName(l1.slice(0, 2)),
      codigoPaisEmisor: cleanName(l1.slice(2, 5)),
      apellidos: cleanName(apellidos),
      nombres: cleanName(resto.join(' ')),
      numeroPasaporte: cleanName(numero),
      nacionalidad: cleanName(l2.slice(10, 13)),
      fechaNacimiento: mrzDateToIso(nacimiento, 'nacimiento', today),
      sexo: l2[20] === '<' ? 'X' : l2[20],
      fechaVencimiento: mrzDateToIso(vencimiento, 'vencimiento', today),
      // Un "número personal" de pocos caracteres es relleno mal leído (se vio un "0" suelto),
      // no un documento de identidad.
      numeroPersonal: personalNumber.replace(/\s/g, '').length >= MIN_PERSONAL_NUMBER_LENGTH ? personalNumber : '',
    },
  };
}

/** Línea 2 de la MRZ transcrita campo por campo (relectura). */
export interface Td3Line2Fields {
  numero: string;
  digitoNumero: string;
  nacionalidad: string;
  nacimiento: string;
  digitoNacimiento: string;
  sexo: string;
  vencimiento: string;
  digitoVencimiento: string;
  numeroPersonal: string;
  digitoPersonal: string;
  digitoFinal: string;
}

/**
 * Arma la línea 2 desde sus campos. Solo agrega el relleno "<" de los dos campos de largo
 * variable (número y número personal), que es formato, no dato: ningún carácter se inventa.
 * Si la IA devolvió un campo con otro largo, la línea queda mal y la verificación lo rechaza.
 */
export function assembleTd3Line2(f: Td3Line2Fields): string {
  const clean = (v: string): string => normalizeLine(v ?? '');
  return (
    clean(f.numero).padEnd(9, '<') +
    clean(f.digitoNumero) +
    clean(f.nacionalidad).padEnd(3, '<') +
    clean(f.nacimiento) +
    clean(f.digitoNacimiento) +
    clean(f.sexo) +
    clean(f.vencimiento) +
    clean(f.digitoVencimiento) +
    clean(f.numeroPersonal).padEnd(14, '<') +
    clean(f.digitoPersonal) +
    clean(f.digitoFinal)
  );
}
