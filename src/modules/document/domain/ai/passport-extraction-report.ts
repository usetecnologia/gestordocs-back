import type {
  AiFieldConfidence,
  ExtractedDateField,
  ExtractedTextField,
  PassportExtraction,
} from './passport-extraction';
import { MrzCheckField, MrzReadResult, Td3Fields, readTd3Mrz } from './mrz-td3';

/**
 * Responde "¿la IA obtuvo bien los datos?" — NO "¿el pasaporte es aceptable?". No se mira si
 * está vencido ni ninguna regla de negocio: solo si la extracción es completa y confiable.
 */

export type ExtractionOutcome = 'COMPLETA' | 'PARCIAL' | 'SIN_DATOS';

/**
 * Tres niveles de confianza para un dato leído:
 *
 * - VERIFICADO: lo protege un dígito de control de la MRZ y ese dígito coincide. Solo aplica a
 *   número, nacimiento, vencimiento y número personal.
 * - COINCIDE: la zona visual y la MRZ dicen lo mismo y la MRZ es válida. Es lo máximo posible
 *   para apellidos, nombres, país y sexo: la línea 1 de la MRZ no tiene dígito de control en
 *   ningún pasaporte (ICAO 9303), así que nunca pueden quedar VERIFICADOS. Que la línea 2 sí
 *   supere los dígitos indica que la MRZ se leyó bien, y la coincidencia es una buena señal.
 * - TOMADO_MRZ: la zona visual no se pudo leer y el dato se tomó de una MRZ válida.
 * - DIFIERE: la zona visual y la MRZ dicen cosas distintas. No se elige ninguna: la evaluación con
 *   76 pasaportes mostró errores de la IA en las dos zonas (incluso una MRZ mal leída que igual
 *   superó la verificación), así que lo decide una persona viendo ambos valores.
 * - OBTENIDO ("sin verificar"): se leyó, pero no hay nada con qué compararlo, o la MRZ con la
 *   que coincide no es válida. La IA puede leer mal ambas zonas "del mismo modo", así que
 *   coincidir con una MRZ inválida no prueba nada.
 */
export type FieldStatus =
  | 'VERIFICADO'
  | 'COINCIDE'
  | 'TOMADO_MRZ'
  | 'OBTENIDO'
  | 'DUDOSO'
  | 'DIFIERE'
  | 'NO_OBTENIDO';

/** De dónde sale el valor final de un dato. */
export type ValueSource = 'MRZ' | 'VISUAL';

export interface FieldReport {
  campo: string;
  etiqueta: string;
  valorVisual: string | null;
  /** Lo que dice la MRZ para este campo, si lo tiene y se pudo leer. */
  valorMrz: string | null;
  /** Texto exacto impreso, solo para fechas. */
  textoOriginal: string | null;
  confianza: AiFieldConfidence | null;
  /**
   * El valor que se usa. Con una MRZ válida tiene prioridad la MRZ; la zona visual solo gana
   * cuando dice lo mismo (porque conserva tildes y Ñ, que la MRZ no admite).
   */
  valorFinal: string | null;
  fuente: ValueSource | null;
  estado: FieldStatus;
  nota: string | null;
}

export interface ExtractionIssue {
  nivel: 'ERROR' | 'ADVERTENCIA';
  mensaje: string;
}

export interface MrzReport {
  estado: MrzReadResult['estado'];
  valida: boolean;
  lineas: string[];
  checks: { campo: MrzCheckField; etiqueta: string; valido: boolean }[];
  motivo: string | null;
  /** Aviso informativo, p. ej. que se corrigió la cantidad de "<". */
  nota: string | null;
}

export interface PassportExtractionReport {
  resultado: ExtractionOutcome;
  resumen: string;
  campos: FieldReport[];
  mrz: MrzReport;
  problemas: ExtractionIssue[];
}

interface FieldSpec {
  campo: keyof PassportExtraction['viz'];
  etiqueta: string;
  /** Campo de la MRZ con el que se compara, si existe. */
  mrz?: keyof Td3Fields;
  /** Dígito de control que protege este campo. */
  check?: MrzCheckField;
  /** Campos sin los que la extracción no se considera completa. */
  clave: boolean;
  comparar?: 'exacto' | 'nombre' | 'sexo';
}

const FIELD_SPECS: FieldSpec[] = [
  { campo: 'numeroPasaporte', etiqueta: 'Número de pasaporte', mrz: 'numeroPasaporte', check: 'numeroPasaporte', clave: true, comparar: 'exacto' },
  { campo: 'apellidos', etiqueta: 'Apellidos', mrz: 'apellidos', clave: true, comparar: 'nombre' },
  { campo: 'nombres', etiqueta: 'Nombres', mrz: 'nombres', clave: true, comparar: 'nombre' },
  { campo: 'fechaNacimiento', etiqueta: 'Fecha de nacimiento', mrz: 'fechaNacimiento', check: 'fechaNacimiento', clave: true, comparar: 'exacto' },
  { campo: 'fechaEmision', etiqueta: 'Fecha de emisión', clave: true },
  { campo: 'fechaVencimiento', etiqueta: 'Fecha de vencimiento', mrz: 'fechaVencimiento', check: 'fechaVencimiento', clave: true, comparar: 'exacto' },
  { campo: 'sexo', etiqueta: 'Sexo', mrz: 'sexo', clave: true, comparar: 'sexo' },
  { campo: 'nacionalidad', etiqueta: 'Nacionalidad', clave: true },
  { campo: 'codigoPaisEmisor', etiqueta: 'Código de país emisor', mrz: 'codigoPaisEmisor', clave: false, comparar: 'exacto' },
  { campo: 'lugarNacimiento', etiqueta: 'Lugar de nacimiento', clave: false },
  { campo: 'autoridadEmisora', etiqueta: 'Autoridad emisora', clave: false },
  // En muchos pasaportes (p. ej. los peruanos) el DNI solo está en la zona visual; cuando la MRZ
  // sí lo trae, su dígito de control lo verifica.
  {
    campo: 'numeroPersonal',
    etiqueta: 'DNI / número personal',
    mrz: 'numeroPersonal',
    check: 'numeroPersonal',
    clave: false,
    comparar: 'exacto',
  },
];

/** Datos que salen de la línea 1 de la MRZ, la que no tiene dígitos de control. */
const LINE1_FIELDS: (keyof Td3Fields)[] = ['codigoPaisEmisor', 'apellidos', 'nombres'];

const CHECK_LABELS: Record<MrzCheckField, string> = {
  numeroPasaporte: 'Número de pasaporte',
  fechaNacimiento: 'Fecha de nacimiento',
  fechaVencimiento: 'Fecha de vencimiento',
  numeroPersonal: 'Número personal',
  compuesto: 'Dígito compuesto',
};

const KIND_MESSAGES: Record<Exclude<PassportExtraction['clasificacion']['tipo'], 'PASAPORTE'>, string> = {
  OTRO_DOCUMENTO_IDENTIDAD: 'El archivo es otro documento de identidad, no un pasaporte.',
  PLANTILLA_EN_BLANCO: 'El archivo es una plantilla o un pasaporte en blanco, sin datos reales.',
  NO_RELACIONADO: 'El archivo no es un documento de identidad.',
};

const QUALITY_LABELS: Record<PassportExtraction['calidad']['problemas'][number], string> = {
  BORROSA: 'borrosa',
  REFLEJOS: 'con reflejos',
  RECORTADA: 'recortada',
  ROTADA: 'rotada',
  BAJA_RESOLUCION: 'de baja resolución',
  OSCURA: 'oscura',
  OBSTRUIDA: 'con partes tapadas',
};

/** Mayúsculas, sin tildes ni signos: la MRZ translitera (Ñ → N) y no admite puntuación. */
function normalizeForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function valuesMatch(visual: string, mrz: string, mode: FieldSpec['comparar']): boolean {
  const a = normalizeForCompare(visual);
  const b = normalizeForCompare(mrz);
  if (mode === 'sexo') return a.charAt(0) === b.charAt(0);
  // La MRZ trunca nombres largos para que entren en 39 caracteres.
  if (mode === 'nombre') return a === b || (b.length > 0 && a.startsWith(b));
  return a === b;
}

function isDateField(field: ExtractedTextField | ExtractedDateField): field is ExtractedDateField {
  return 'textoOriginal' in field;
}

function buildFieldReport(
  spec: FieldSpec,
  extraction: PassportExtraction,
  mrz: MrzReadResult,
): FieldReport {
  const field = extraction.viz[spec.campo];
  const visual = field.valor?.trim() || null;
  const textoOriginal = isDateField(field) ? field.textoOriginal?.trim() || null : null;
  const mrzRead = mrz.estado === 'LEIDA' ? mrz : null;
  // Si la línea 1 no supera sus controles de forma, sus datos no se usan.
  const usesLine1 = !!spec.mrz && LINE1_FIELDS.includes(spec.mrz);
  const line1Rejected = usesLine1 && !!mrzRead && !mrzRead.linea1Confiable;
  const valorMrz = mrzRead && spec.mrz && !line1Rejected ? mrzRead.campos[spec.mrz] || null : null;
  const checkFailed =
    !!spec.check && !!mrzRead && mrzRead.checks.some((c) => c.campo === spec.check && !c.valido);

  const base = {
    campo: spec.campo,
    etiqueta: spec.etiqueta,
    valorVisual: visual,
    valorMrz,
    textoOriginal,
    confianza: field.confianza,
  };
  const fromMrz = { valorFinal: valorMrz, fuente: 'MRZ' as const };
  const fromVisual = { valorFinal: visual, fuente: 'VISUAL' as const };

  if (!visual && !valorMrz) {
    const nota = textoOriginal
      ? `Se ve "${textoOriginal}" pero no se pudo interpretar con certeza.`
      : 'No se encontró en el documento o no es legible.';
    return { ...base, valorFinal: null, fuente: null, estado: 'NO_OBTENIDO', nota };
  }

  const mrzIsValid = !!mrzRead && mrzRead.valida;
  const matches = !!visual && !!valorMrz && !!spec.comparar && valuesMatch(visual, valorMrz, spec.comparar);

  // ── MRZ válida ──
  if (valorMrz && mrzIsValid) {
    if (!visual) {
      return spec.check
        ? { ...base, ...fromMrz, estado: 'VERIFICADO', nota: 'Solo se pudo leer en la MRZ; su número de verificación confirma que es correcto.' }
        : { ...base, ...fromMrz, estado: 'TOMADO_MRZ', nota: 'La zona visual no se pudo leer; se tomó de la MRZ.' };
    }
    if (!matches) {
      return {
        ...base,
        valorFinal: null,
        fuente: null,
        estado: 'DIFIERE',
        nota: `La zona visual dice "${visual}" y la MRZ dice "${valorMrz}". Revisa el documento para saber cuál es el correcto.`,
      };
    }
    return spec.check
      ? { ...base, ...fromMrz, estado: 'VERIFICADO', nota: null }
      : { ...base, ...fromVisual, estado: 'COINCIDE', nota: 'La zona visual y la MRZ dicen lo mismo.' };
  }

  // ── Sin MRZ válida: la zona visual, con la desconfianza que corresponda ──
  if (!visual && valorMrz) {
    return {
      ...base,
      ...fromMrz,
      estado: 'DUDOSO',
      nota: 'Solo se pudo leer en la MRZ, y la MRZ tiene errores de lectura: no es confiable.',
    };
  }
  if (visual && valorMrz && spec.comparar && !matches) {
    return {
      ...base,
      valorFinal: null,
      fuente: null,
      estado: 'DIFIERE',
      nota: `La zona visual dice "${visual}" y la MRZ dice "${valorMrz}", y la MRZ tiene errores de lectura. Revisa el documento.`,
    };
  }
  if (checkFailed) {
    return { ...base, ...fromVisual, estado: 'DUDOSO', nota: 'El número de verificación de la MRZ no coincide: probablemente se leyó mal.' };
  }
  if (field.confianza === 'BAJA') {
    return { ...base, ...fromVisual, estado: 'DUDOSO', nota: 'La IA lo leyó con confianza baja.' };
  }
  if (valorMrz) {
    return { ...base, ...fromVisual, estado: 'OBTENIDO', nota: 'Coincide con la MRZ, pero la MRZ tiene errores de lectura, así que no lo confirma.' };
  }
  return {
    ...base,
    ...fromVisual,
    estado: 'OBTENIDO',
    nota: line1Rejected
      ? 'La línea 1 de la MRZ se leyó mal, así que no sirve para compararlo.'
      : 'No figura en la MRZ: no hay cómo verificarlo automáticamente.',
  };
}

function buildMrzReport(extraction: PassportExtraction, mrz: MrzReadResult): MrzReport {
  return {
    estado: mrz.estado,
    valida: mrz.estado === 'LEIDA' && mrz.valida,
    lineas: mrz.estado === 'LEIDA' ? mrz.lineas : extraction.mrz.lineas,
    checks:
      mrz.estado === 'LEIDA'
        ? mrz.checks.map((c) => ({ ...c, etiqueta: CHECK_LABELS[c.campo] }))
        : [],
    motivo:
      mrz.estado === 'FORMATO_INVALIDO'
        ? mrz.motivo
        : mrz.estado === 'AUSENTE'
          ? 'No se encontró la MRZ (las 2 líneas con "<" al pie de la página de datos).'
          : null,
    nota: [
      mrz.estado === 'LEIDA' && mrz.rellenoAjustado
        ? 'La IA contó mal los caracteres "<" de relleno; se corrigió la cantidad antes de verificar' +
          (mrz.valida ? ' y los números de verificación coinciden.' : '.')
        : null,
      mrz.estado === 'LEIDA' && mrz.motivoLinea1
        ? `${mrz.motivoLinea1} Por eso no se usa para comparar el país, los apellidos ni los nombres.`
        : null,
    ]
      .filter(Boolean)
      .join(' ') || null,
  };
}

function collectIssues(
  extraction: PassportExtraction,
  mrzReport: MrzReport,
  campos: FieldReport[],
): ExtractionIssue[] {
  const issues: ExtractionIssue[] = [];
  const { calidad } = extraction;

  if (!mrzReport.valida) {
    const causa =
      mrzReport.motivo ??
      `La MRZ no pasa la verificación (${mrzReport.checks
        .filter((c) => !c.valido)
        .map((c) => c.etiqueta.toLowerCase())
        .join(', ')}).`;
    issues.push({
      nivel: 'ERROR',
      mensaje: `${causa} Sin una MRZ válida ningún dato queda verificado: podrían estar mal leídos o ser inventados.`,
    });
  }

  const missing = campos.filter((c) => c.estado === 'NO_OBTENIDO' && FIELD_SPECS.find((s) => s.campo === c.campo)?.clave);
  if (missing.length > 0) {
    issues.push({
      nivel: 'ERROR',
      mensaje: `No se obtuvo: ${missing.map((c) => c.etiqueta.toLowerCase()).join(', ')}.`,
    });
  }

  const different = campos.filter((c) => c.estado === 'DIFIERE');
  if (different.length > 0) {
    issues.push({
      nivel: 'ADVERTENCIA',
      mensaje: `La zona visual y la MRZ difieren en: ${different.map((c) => c.etiqueta.toLowerCase()).join(', ')}.`,
    });
  }

  if (calidad.legibilidad !== 'BUENA' || calidad.problemas.length > 0) {
    const detalle = calidad.problemas.map((p) => QUALITY_LABELS[p]).join(', ');
    issues.push({
      nivel: calidad.legibilidad === 'MALA' ? 'ERROR' : 'ADVERTENCIA',
      mensaje: `Legibilidad ${calidad.legibilidad.toLowerCase()}${detalle ? `: imagen ${detalle}` : ''}.`,
    });
  }

  if (calidad.origen === 'FOTO_DE_PANTALLA' || calidad.origen === 'CAPTURA_DE_PANTALLA') {
    issues.push({
      nivel: 'ADVERTENCIA',
      mensaje: 'Parece una foto o captura de una pantalla, no del documento físico.',
    });
  }

  if (!extraction.fotoTitularPresente) {
    issues.push({ nivel: 'ADVERTENCIA', mensaje: 'No se ve la foto del titular.' });
  }

  for (const alteracion of extraction.alteraciones) {
    issues.push({ nivel: 'ADVERTENCIA', mensaje: `Posible alteración: ${alteracion}` });
  }

  return issues;
}

export function buildPassportExtractionReport(
  extraction: PassportExtraction,
  today: Date = new Date(),
): PassportExtractionReport {
  const mrz = readTd3Mrz(extraction.mrz.lineas, today);
  const mrzReport = buildMrzReport(extraction, mrz);
  const campos = FIELD_SPECS.map((spec) => buildFieldReport(spec, extraction, mrz));
  const problemas = collectIssues(extraction, mrzReport, campos);

  const { clasificacion } = extraction;
  const obtenidos = campos.filter((c) => c.estado !== 'NO_OBTENIDO').length;

  if (clasificacion.tipo !== 'PASAPORTE' || obtenidos === 0) {
    const base =
      clasificacion.tipo !== 'PASAPORTE'
        ? KIND_MESSAGES[clasificacion.tipo]
        : 'No se pudo leer ningún dato del pasaporte.';
    const resumen = clasificacion.descripcion ? `${base} La IA ve: ${clasificacion.descripcion}` : base;
    return { resultado: 'SIN_DATOS', resumen, campos, mrz: mrzReport, problemas };
  }

  if (!clasificacion.paginaDatosVisible) {
    return {
      resultado: 'SIN_DATOS',
      resumen: 'Es un pasaporte, pero no se ve la página de datos (la de la foto y la MRZ).',
      campos,
      mrz: mrzReport,
      problemas,
    };
  }

  const claves = campos.filter((c) => FIELD_SPECS.find((s) => s.campo === c.campo)?.clave);
  const verificados = claves.filter((c) => c.estado === 'VERIFICADO').length;
  const coinciden = claves.filter((c) => c.estado === 'COINCIDE' || c.estado === 'TOMADO_MRZ').length;
  const leidos = claves.filter((c) => c.estado === 'OBTENIDO').length;
  const clavesObtenidas = verificados + coinciden + leidos;
  const completa = clavesObtenidas === claves.length && mrzReport.valida;
  const sinVerificar = claves
    .filter((c) => c.estado === 'OBTENIDO')
    .map((c) => c.etiqueta.toLowerCase())
    .join(', ');

  return {
    resultado: completa ? 'COMPLETA' : 'PARCIAL',
    resumen: completa
      ? `Se obtuvieron todos los datos clave: ${verificados} verificados y ${coinciden} que coinciden con la MRZ` +
        (sinVerificar ? `. Sin forma de verificar: ${sinVerificar}.` : '.')
      : `Se obtuvieron ${clavesObtenidas} de ${claves.length} datos clave: ${verificados} verificados y ${coinciden} que coinciden con la MRZ.`,
    campos,
    mrz: mrzReport,
    problemas,
  };
}
