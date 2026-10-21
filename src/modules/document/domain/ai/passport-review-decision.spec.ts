import type { PassportExtraction } from './passport-extraction';
import { buildPassportExtractionReport } from './passport-extraction-report';
import { computeCheckDigit } from './mrz-td3';
import {
  decidePassportReview,
  isAdultAtIssue,
  isIssueDateCoherent,
  type ParticipantRegistry,
} from './passport-review-decision';

const TODAY = new Date(Date.UTC(2026, 9, 22));
const text = (valor: string | null) => ({ valor, confianza: valor ? ('ALTA' as const) : null });
const date = (valor: string | null) => ({ textoOriginal: valor, valor, confianza: valor ? ('ALTA' as const) : null });

/** Línea 2 TD3 con todos los dígitos de control calculados. */
function line2(numero: string, birthYymmdd: string, sex: string, expiryYymmdd: string, personal: string): string {
  const num = numero.padEnd(9, '<');
  const pers = personal.padEnd(14, '<');
  const persCheck = /^<+$/.test(pers) ? '<' : String(computeCheckDigit(pers));
  const body =
    num + computeCheckDigit(num) + 'PER' + birthYymmdd + computeCheckDigit(birthYymmdd) + sex +
    expiryYymmdd + computeCheckDigit(expiryYymmdd) + pers + persCheck;
  const composite = computeCheckDigit(body.slice(0, 10) + body.slice(13, 20) + body.slice(21, 43));
  return body + composite;
}

interface Person {
  apellidos: string;
  nombres: string;
  nacimiento: string;
  emision: string;
  vencimiento: string;
  dni: string;
}

const ADULT: Person = {
  apellidos: 'LAOS AMPA',
  nombres: 'YADHIRA YOJHANA',
  nacimiento: '2003-04-06',
  emision: '2022-10-17',
  vencimiento: '2032-10-17',
  dni: '75002127',
};

function passport(p: Person, overrides: Partial<PassportExtraction> = {}): PassportExtraction {
  const yymmdd = (iso: string): string => iso.slice(2).replace(/-/g, '');
  const [ap1, ap2] = p.apellidos.split(' ');
  const [n1, n2] = p.nombres.split(' ');
  return {
    clasificacion: { tipo: 'PASAPORTE', descripcion: null, paginaDatosVisible: true, paginaDatos: 1 },
    calidad: { legibilidad: 'BUENA', origen: 'ESCANEO', problemas: [] },
    viz: {
      tipoDocumento: text('P'),
      codigoPaisEmisor: text('PER'),
      paisEmisor: text('PERÚ'),
      numeroPasaporte: text('122544455'),
      apellidos: text(p.apellidos),
      nombres: text(p.nombres),
      nacionalidad: text('PERUANA'),
      sexo: text('F'),
      lugarNacimiento: text('LIMA'),
      autoridadEmisora: text(null),
      numeroPersonal: text(p.dni),
      fechaNacimiento: date(p.nacimiento),
      fechaEmision: date(p.emision),
      fechaVencimiento: date(p.vencimiento),
    },
    mrz: {
      lineas: [
        `P<PER${ap1}<${ap2}<<${n1}<${n2}`.padEnd(44, '<'),
        line2('122544455', yymmdd(p.nacimiento), 'F', yymmdd(p.vencimiento), ''),
      ],
      confianza: 'ALTA',
    },
    fotoTitularPresente: true,
    firmaPresente: true,
    alteraciones: [],
    observaciones: null,
    ...overrides,
  };
}

function registryOf(p: Person): ParticipantRegistry {
  return { dni: p.dni, apellidos: p.apellidos, nombres: p.nombres, nacimiento: p.nacimiento };
}

function decide(extraction: PassportExtraction, registry: ParticipantRegistry) {
  return decidePassportReview(extraction, buildPassportExtractionReport(extraction, TODAY), registry, TODAY);
}

describe('isIssueDateCoherent', () => {
  it('acepta mismo día y mes con 5 o 10 años de diferencia', () => {
    expect(isIssueDateCoherent('2025-04-25', '2035-04-25')).toBe(true);
    expect(isIssueDateCoherent('2022-11-24', '2027-11-24')).toBe(true);
  });
  it('rechaza un día distinto o una diferencia rara', () => {
    expect(isIssueDateCoherent('2025-04-26', '2035-04-25')).toBe(false);
    expect(isIssueDateCoherent('2025-04-25', '2032-04-25')).toBe(false);
    expect(isIssueDateCoherent(null, '2035-04-25')).toBe(false);
  });
});

describe('isAdultAtIssue', () => {
  it('el día del cumpleaños 18 todavía no es mayor de edad', () => {
    expect(isAdultAtIssue('2005-03-10', '2023-03-10')).toBe(false);
    expect(isAdultAtIssue('2005-03-10', '2023-03-11')).toBe(true);
    expect(isAdultAtIssue('2005-03-10', '2022-12-31')).toBe(false);
  });
});

describe('decidePassportReview', () => {
  it('aprueba cuando todo está confirmado', () => {
    const result = decide(passport(ADULT), registryOf(ADULT));
    expect(result.decision).toBe('APROBAR');
    expect(result.comparaciones.every((c) => c.resultado === 'IGUAL')).toBe(true);
  });

  it('deja para revisión si un apellido no coincide con el registro (caso QUSPE / QUISPE)', () => {
    const result = decide(passport(ADULT), { ...registryOf(ADULT), apellidos: 'LAOS CAMPA' });
    expect(result.decision).toBe('REVISION_MANUAL');
    expect(result.motivos.join(' ')).toContain('Apellidos no coincide');
  });

  it('deja para revisión si el DNI tiene un dígito distinto', () => {
    const result = decide(passport(ADULT), { ...registryOf(ADULT), dni: '75002128' });
    expect(result.decision).toBe('REVISION_MANUAL');
  });

  it('observa si el archivo no es un pasaporte', () => {
    const result = decide(
      passport(ADULT, { clasificacion: { tipo: 'NO_RELACIONADO', descripcion: 'Una boleta', paginaDatosVisible: false, paginaDatos: null } }),
      registryOf(ADULT),
    );
    expect(result.decision).toBe('OBSERVAR');
    expect(result.observacion).toContain('no corresponde a un pasaporte');
  });

  it('observa si era menor de edad al emitirse, con fechas confirmadas', () => {
    const minor: Person = { ...ADULT, nacimiento: '2007-02-02', emision: '2022-11-24', vencimiento: '2027-11-24' };
    const result = decide(passport(minor), registryOf(minor));
    expect(result.decision).toBe('OBSERVAR');
    expect(result.observacion).toContain('menor de edad');
  });

  it('no observa por edad si la emisión no es coherente con el vencimiento', () => {
    const minor: Person = { ...ADULT, nacimiento: '2007-02-02', emision: '2022-11-25', vencimiento: '2027-11-24' };
    const result = decide(passport(minor), registryOf(minor));
    expect(result.decision).toBe('REVISION_MANUAL');
  });

  it('no observa por edad si la fecha de nacimiento no coincide con el registro', () => {
    const minor: Person = { ...ADULT, nacimiento: '2007-02-02', emision: '2022-11-24', vencimiento: '2027-11-24' };
    const result = decide(passport(minor), { ...registryOf(minor), nacimiento: '2000-02-02' });
    expect(result.decision).toBe('REVISION_MANUAL');
  });

  it('deja para revisión si la MRZ no es válida', () => {
    const extraction = passport(ADULT);
    extraction.mrz.lineas[1] = extraction.mrz.lineas[1].replace('122544455', '122544456');
    const result = decide(extraction, registryOf(ADULT));
    expect(result.decision).toBe('REVISION_MANUAL');
  });

  it('deja para revisión si la IA vio posibles alteraciones', () => {
    const result = decide(passport(ADULT, { alteraciones: ['La foto parece pegada'] }), registryOf(ADULT));
    expect(result.decision).toBe('REVISION_MANUAL');
  });
});
