import type { PassportExtraction } from './passport-extraction';
import type { FieldReport, PassportExtractionReport } from './passport-extraction-report';

/**
 * Decide qué hace la revisión automática con un pasaporte. Es deliberadamente conservadora:
 *
 * - APROBAR solo si TODO está confirmado: lectura completa con MRZ válida, datos iguales al
 *   registro del participante y mayor de edad al emitirse (con la emisión coherente).
 * - OBSERVAR solo por motivos claros: no es un pasaporte, está ilegible, o era menor de edad al
 *   emitirse con fechas confirmadas.
 * - Todo lo demás queda para un revisor (REVISION_MANUAL), con los motivos a la vista.
 *
 * El 4/8/2026 una revisión masiva observó 245 pasaportes que hubo que revertir: por eso ninguna
 * duda se resuelve observando.
 */

export type ReviewDecision = 'APROBAR' | 'OBSERVAR' | 'REVISION_MANUAL';

export type RegistryComparison = 'IGUAL' | 'PARCIAL' | 'DISTINTO' | 'SIN_LECTURA' | 'SIN_REGISTRO' | 'NO_APLICA';

/** Lo que el participante registró en el sistema. */
export interface ParticipantRegistry {
  dni: string | null;
  nombres: string;
  apellidos: string;
  /** YYYY-MM-DD */
  nacimiento: string | null;
}

export interface RegistryCheck {
  campo: 'dni' | 'apellidos' | 'nombres' | 'nacimiento';
  etiqueta: string;
  leido: string | null;
  registrado: string | null;
  resultado: RegistryComparison;
}

export interface PassportReviewDecision {
  decision: ReviewDecision;
  /** Motivos para el revisor, en orden de importancia. */
  motivos: string[];
  /** Texto que se registra como observación (y que vería el participante). Solo si OBSERVAR. */
  observacion: string | null;
  comparaciones: RegistryCheck[];
  /** La fecha de emisión es coherente con el vencimiento verificado (mismo día y mes, 5 o 10 años). */
  emisionCoherente: boolean;
  mayorDeEdadAlEmitirse: boolean | null;
}

const MINIMUM_ADULT_AGE = 18;
const PASSPORT_VALIDITY_YEARS = [5, 10];
/** Estados en los que el valor final se puede usar sin que lo mire una persona. */
const TRUSTED_STATES = new Set(['VERIFICADO', 'COINCIDE', 'TOMADO_MRZ', 'OBTENIDO']);

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compareNames(read: string | null, registered: string): RegistryComparison {
  if (!normalize(registered)) return 'SIN_REGISTRO';
  if (!read) return 'SIN_LECTURA';
  const a = normalize(read);
  const b = normalize(registered);
  if (a === b) return 'IGUAL';
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const subset = (x: Set<string>, y: Set<string>): boolean => [...x].every((t) => y.has(t));
  return subset(ta, tb) || subset(tb, ta) ? 'PARCIAL' : 'DISTINTO';
}

function compareExact(read: string | null, registered: string | null): RegistryComparison {
  if (!registered?.trim()) return 'SIN_REGISTRO';
  if (!read) return 'SIN_LECTURA';
  return normalize(read).replace(/ /g, '') === normalize(registered).replace(/ /g, '') ? 'IGUAL' : 'DISTINTO';
}

function parseIso(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * La emisión no está en la MRZ y nunca se puede verificar directamente. Pero los pasaportes se
 * emiten con vencimiento el mismo día y mes, 5 o 10 años después: si coincide con el vencimiento
 * (que sí está verificado), la fecha de emisión se leyó bien.
 */
export function isIssueDateCoherent(issue: string | null, expiry: string | null): boolean {
  const i = parseIso(issue);
  const e = parseIso(expiry);
  if (!i || !e) return false;
  const sameDayMonth = i.getUTCMonth() === e.getUTCMonth() && i.getUTCDate() === e.getUTCDate();
  return sameDayMonth && PASSPORT_VALIDITY_YEARS.includes(e.getUTCFullYear() - i.getUTCFullYear());
}

/**
 * Debe ser MAYOR de 18 años al emitirse: si la emisión ocurre el mismo día del 18° cumpleaños o
 * antes, todavía no lo es. Es la misma regla que usaba la revisión masiva.
 */
export function isAdultAtIssue(birth: string | null, issue: string | null): boolean | null {
  const b = parseIso(birth);
  const i = parseIso(issue);
  if (!b || !i) return null;
  const eighteenth = new Date(b.getTime());
  eighteenth.setUTCFullYear(b.getUTCFullYear() + MINIMUM_ADULT_AGE);
  return i.getTime() > eighteenth.getTime();
}

function field(report: PassportExtractionReport, campo: string): FieldReport | undefined {
  return report.campos.find((c) => c.campo === campo);
}

function compareWithRegistry(report: PassportExtractionReport, registry: ParticipantRegistry): RegistryCheck[] {
  const value = (campo: string): string | null => field(report, campo)?.valorFinal ?? null;
  // Solo los pasaportes peruanos imprimen el DNI; en otros países el número personal es otro dato.
  const isPeruvian = normalize(value('codigoPaisEmisor')) === 'PER';
  return [
    {
      campo: 'dni',
      etiqueta: 'DNI',
      leido: value('numeroPersonal'),
      registrado: registry.dni,
      resultado: isPeruvian ? compareExact(value('numeroPersonal'), registry.dni) : 'NO_APLICA',
    },
    {
      campo: 'apellidos',
      etiqueta: 'Apellidos',
      leido: value('apellidos'),
      registrado: registry.apellidos,
      resultado: compareNames(value('apellidos'), registry.apellidos),
    },
    {
      campo: 'nombres',
      etiqueta: 'Nombres',
      leido: value('nombres'),
      registrado: registry.nombres,
      resultado: compareNames(value('nombres'), registry.nombres),
    },
    {
      campo: 'nacimiento',
      etiqueta: 'Fecha de nacimiento',
      leido: value('fechaNacimiento'),
      registrado: registry.nacimiento,
      resultado: compareExact(value('fechaNacimiento'), registry.nacimiento),
    },
  ];
}

const COMPARISON_TEXT: Record<RegistryComparison, string> = {
  IGUAL: 'coincide',
  PARCIAL: 'coincide solo en parte',
  DISTINTO: 'no coincide',
  SIN_LECTURA: 'no se pudo leer',
  SIN_REGISTRO: 'no está registrado',
  NO_APLICA: 'no aplica',
};

export function decidePassportReview(
  extraction: PassportExtraction,
  report: PassportExtractionReport,
  registry: ParticipantRegistry,
  today: Date = new Date(),
): PassportReviewDecision {
  const comparaciones = compareWithRegistry(report, registry);
  const birth = field(report, 'fechaNacimiento');
  const issue = field(report, 'fechaEmision');
  const expiry = field(report, 'fechaVencimiento');
  const emisionCoherente = isIssueDateCoherent(issue?.valorFinal ?? null, expiry?.valorFinal ?? null);
  const mayorDeEdadAlEmitirse = isAdultAtIssue(birth?.valorFinal ?? null, issue?.valorFinal ?? null);
  const base = { comparaciones, emisionCoherente, mayorDeEdadAlEmitirse };

  const observe = (motivo: string, observacion: string): PassportReviewDecision => ({
    ...base,
    decision: 'OBSERVAR',
    motivos: [motivo],
    observacion,
  });

  // ── Motivos claros para observar ──
  const { clasificacion, calidad } = extraction;
  if (clasificacion.tipo !== 'PASAPORTE') {
    return observe(
      `La IA identificó el archivo como "${clasificacion.tipo.toLowerCase().replace(/_/g, ' ')}", no como un pasaporte.`,
      'El archivo subido no corresponde a un pasaporte. Por favor, sube la página de datos de tu pasaporte (la que tiene tu foto).',
    );
  }
  if (calidad.legibilidad === 'MALA' && !report.mrz.valida) {
    return observe(
      'La imagen es ilegible y la MRZ no se pudo leer.',
      'No es posible leer los datos de tu pasaporte. Por favor, sube una nueva foto nítida, sin brillos y con la página de datos completa.',
    );
  }

  const birthConfirmed =
    birth?.estado === 'VERIFICADO' && comparaciones.find((c) => c.campo === 'nacimiento')?.resultado === 'IGUAL';
  if (mayorDeEdadAlEmitirse === false && birthConfirmed && emisionCoherente) {
    return observe(
      `Menor de edad al emitirse el pasaporte (nacimiento ${birth?.valorFinal}, emisión ${issue?.valorFinal}), con la fecha de nacimiento verificada y la emisión coherente con el vencimiento.`,
      `El pasaporte fue emitido cuando eras menor de edad (nacimiento: ${birth?.valorFinal}, emisión: ` +
        `${issue?.valorFinal}). Debes presentar un pasaporte emitido siendo mayor de ${MINIMUM_ADULT_AGE} años.`,
    );
  }

  // ── Condiciones para aprobar: si falta alguna, queda para un revisor ──
  const motivos: string[] = [];
  if (report.resultado !== 'COMPLETA') motivos.push(`La lectura no es completa: ${report.resumen}`);
  if (!report.mrz.valida) motivos.push('La MRZ no pasó la verificación.');
  for (const c of report.campos) {
    if (!TRUSTED_STATES.has(c.estado) && c.estado !== 'NO_OBTENIDO') {
      motivos.push(`${c.etiqueta}: ${c.nota ?? 'requiere revisión.'}`);
    }
  }
  for (const c of comparaciones) {
    if (c.resultado !== 'IGUAL' && c.resultado !== 'NO_APLICA') {
      motivos.push(`${c.etiqueta} ${COMPARISON_TEXT[c.resultado]} con el registro (leído: ${c.leido ?? '—'}, registrado: ${c.registrado ?? '—'}).`);
    }
  }
  if (!emisionCoherente) {
    motivos.push('La fecha de emisión no es coherente con el vencimiento: no se puede confirmar la edad al emitirse.');
  } else if (mayorDeEdadAlEmitirse === false) {
    motivos.push('Era menor de edad al emitirse, pero la fecha de nacimiento no está confirmada: no se observa automáticamente.');
  } else if (mayorDeEdadAlEmitirse === null) {
    motivos.push('No se pudo calcular la edad al emitirse.');
  }
  const expiryDate = parseIso(expiry?.valorFinal ?? null);
  if (expiryDate && expiryDate.getTime() < today.getTime()) {
    motivos.push(`El pasaporte está vencido (${expiry?.valorFinal}).`);
  }
  if (extraction.alteraciones.length > 0) {
    motivos.push(`La IA vio posibles alteraciones: ${extraction.alteraciones.join('; ')}`);
  }

  if (motivos.length > 0) {
    return { ...base, decision: 'REVISION_MANUAL', motivos, observacion: null };
  }
  return {
    ...base,
    decision: 'APROBAR',
    motivos: ['Lectura completa con MRZ válida, datos iguales al registro y mayor de edad al emitirse.'],
    observacion: null,
  };
}
