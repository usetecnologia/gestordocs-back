import type { PassportExtraction } from './passport-extraction';
import { buildPassportExtractionReport } from './passport-extraction-report';

const TODAY = new Date(Date.UTC(2026, 9, 21));
const text = (valor: string | null) => ({ valor, confianza: valor ? ('ALTA' as const) : null });
const date = (valor: string | null) => ({
  textoOriginal: valor,
  valor,
  confianza: valor ? ('ALTA' as const) : null,
});

function passport(overrides: Partial<PassportExtraction> = {}): PassportExtraction {
  return {
    clasificacion: { tipo: 'PASAPORTE', descripcion: null, paginaDatosVisible: true, paginaDatos: 1 },
    calidad: { legibilidad: 'BUENA', origen: 'ESCANEO', problemas: [] },
    viz: {
      tipoDocumento: text('P'),
      codigoPaisEmisor: text('UTO'),
      paisEmisor: text('Utopía'),
      numeroPasaporte: text('L898902C3'),
      apellidos: text('ERIKSSON'),
      nombres: text('ANNA MARÍA'),
      nacionalidad: text('UTOPIANA'),
      sexo: text('F'),
      lugarNacimiento: text('ZENITH'),
      autoridadEmisora: text('PASSPORT OFFICE'),
      numeroPersonal: text('ZE184226B'),
      fechaNacimiento: date('1974-08-12'),
      fechaEmision: date('2002-04-16'),
      fechaVencimiento: date('2012-04-15'),
    },
    mrz: {
      lineas: [
        'P<UTOERIKSSON<<ANNA<MARIA'.padEnd(44, '<'),
        'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
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

describe('buildPassportExtractionReport', () => {
  it('da COMPLETA cuando todo se obtuvo y la MRZ es válida (sin juzgar si está vencido)', () => {
    const report = buildPassportExtractionReport(passport(), TODAY);
    expect(report.resultado).toBe('COMPLETA');
    expect(report.problemas).toEqual([]);
    const estados = Object.fromEntries(report.campos.map((c) => [c.campo, c.estado]));
    // Solo lo protegido por un dígito de control queda verificado; el resto, leído.
    expect(estados.numeroPasaporte).toBe('VERIFICADO');
    expect(estados.fechaNacimiento).toBe('VERIFICADO');
    // La línea 1 de la MRZ no tiene dígito de control: lo máximo posible es que coincida.
    expect(estados.apellidos).toBe('COINCIDE');
    expect(estados.codigoPaisEmisor).toBe('COINCIDE');
    expect(estados.sexo).toBe('COINCIDE');
    expect(estados.fechaVencimiento).toBe('VERIFICADO');
    expect(estados.fechaEmision).toBe('OBTENIDO');
    expect(report.resumen).toContain('fecha de emisión');
  });

  it('da SIN_DATOS si el archivo no es un pasaporte, con el motivo', () => {
    const report = buildPassportExtractionReport(
      passport({
        clasificacion: {
          tipo: 'NO_RELACIONADO',
          descripcion: 'Una foto de un paisaje.',
          paginaDatosVisible: false,
          paginaDatos: null,
        },
      }),
      TODAY,
    );
    expect(report.resultado).toBe('SIN_DATOS');
    expect(report.resumen).toContain('no es un documento de identidad');
    expect(report.resumen).toContain('paisaje');
  });

  it('da SIN_DATOS si es un pasaporte pero no se ve la página de datos', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ clasificacion: { ...base.clasificacion, paginaDatosVisible: false } }),
      TODAY,
    );
    expect(report.resultado).toBe('SIN_DATOS');
    expect(report.resumen).toContain('página de datos');
  });

  it('si la zona visual y una MRZ válida difieren, no elige ninguna: queda para revisar', () => {
    // En la evaluación hubo errores en las dos zonas, incluida una fecha mal leída en la MRZ que
    // igual superó la verificación. Elegir automáticamente producía datos fantasma.
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ viz: { ...base.viz, fechaNacimiento: date('1974-08-13'), apellidos: text('ERIKSON') } }),
      TODAY,
    );
    for (const campo of ['fechaNacimiento', 'apellidos']) {
      const field = report.campos.find((c) => c.campo === campo);
      expect(field?.estado).toBe('DIFIERE');
      expect(field?.valorFinal).toBeNull();
      expect(field?.nota).toContain('Revisa');
    }
    expect(report.resultado).toBe('PARCIAL');
  });

  it('si la zona visual no se leyó, toma el dato de una MRZ válida', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ viz: { ...base.viz, apellidos: text(null) } }),
      TODAY,
    );
    const field = report.campos.find((c) => c.campo === 'apellidos');
    expect(field?.estado).toBe('TOMADO_MRZ');
    expect(field?.valorFinal).toBe('ERIKSSON');
  });

  it('no usa la línea 1 si se leyó corrida (país distinto al de la línea 2)', () => {
    // Caso real: "P<PRIOS<LIZANO..." en vez de "P<PERRIOS<LIZANO...": la MRZ decía "OS LIZANO".
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ mrz: { lineas: ['P<UTERIKSSON<<ANNA<MARIA', base.mrz.lineas[1]], confianza: 'ALTA' } }),
      TODAY,
    );
    const apellidos = report.campos.find((c) => c.campo === 'apellidos');
    expect(apellidos?.valorMrz).toBeNull();
    expect(apellidos?.estado).toBe('OBTENIDO');
    expect(apellidos?.valorFinal).toBe('ERIKSSON');
    expect(report.mrz.nota).toContain('línea 1');
  });

  it('no usa la línea 1 si falta el "<<" entre apellidos y nombres', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ mrz: { lineas: ['P<UTOERIKSSON<ANNA<MARIA'.padEnd(44, '<'), base.mrz.lineas[1]], confianza: 'ALTA' } }),
      TODAY,
    );
    expect(report.campos.find((c) => c.campo === 'apellidos')?.valorMrz).toBeNull();
    expect(report.campos.find((c) => c.campo === 'nombres')?.estado).toBe('OBTENIDO');
  });

  it('si coinciden, se usa la zona visual porque conserva las tildes', () => {
    const report = buildPassportExtractionReport(passport(), TODAY);
    const field = report.campos.find((c) => c.campo === 'nombres');
    expect(field?.estado).toBe('COINCIDE');
    expect(field?.valorFinal).toBe('ANNA MARÍA');
    expect(field?.fuente).toBe('VISUAL');
  });

  it('con la MRZ inválida, una diferencia queda marcada y no se elige la MRZ', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({
        viz: { ...base.viz, apellidos: text('ERIKSON') },
        mrz: {
          lineas: [base.mrz.lineas[0], 'L898902C36UTO7408129F1204159ZE184226B<<<<<10'],
          confianza: 'MEDIA',
        },
      }),
      TODAY,
    );
    const field = report.campos.find((c) => c.campo === 'apellidos');
    expect(field?.estado).toBe('DIFIERE');
    expect(field?.valorFinal).toBeNull();
    expect(report.resultado).toBe('PARCIAL');
  });

  it('lista los datos clave que no se obtuvieron', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ viz: { ...base.viz, fechaEmision: date(null) } }),
      TODAY,
    );
    expect(report.resultado).toBe('PARCIAL');
    expect(report.campos.find((c) => c.campo === 'fechaEmision')?.estado).toBe('NO_OBTENIDO');
    expect(
      report.problemas.some((p) => p.nivel === 'ERROR' && p.mensaje.includes('fecha de emisión')),
    ).toBe(true);
  });

  it('usa el dato de la MRZ cuando la zona visual no se pudo leer', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({ viz: { ...base.viz, numeroPasaporte: text(null) } }),
      TODAY,
    );
    const field = report.campos.find((c) => c.campo === 'numeroPasaporte');
    expect(field?.estado).toBe('VERIFICADO');
    expect(field?.valorMrz).toBe('L898902C3');
  });

  it('advierte cuando la MRZ no está', () => {
    const report = buildPassportExtractionReport(
      passport({ mrz: { lineas: [], confianza: null } }),
      TODAY,
    );
    expect(report.resultado).toBe('PARCIAL');
    expect(report.mrz.estado).toBe('AUSENTE');
  });

  it('no verifica nada si la MRZ es inválida, aunque coincida con la zona visual', () => {
    // El caso real: con la imagen de costado la IA "leyó" BLZ en ambas zonas. Que coincidan no
    // prueba nada si la MRZ no supera los dígitos de control.
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({
        viz: { ...base.viz, codigoPaisEmisor: text('BLZ') },
        mrz: {
          lineas: [
            'P<BLZERIKSSON<<ANNA<MARIA'.padEnd(44, '<'),
            // Mal leída: el dígito del nacimiento no coincide.
            'L898902C36BLZ7408129F1204159ZE184226B<<<<<10',
          ],
          confianza: 'MEDIA',
        },
      }),
      TODAY,
    );
    expect(report.resultado).toBe('PARCIAL');
    expect(report.campos.find((c) => c.campo === 'codigoPaisEmisor')?.estado).toBe('OBTENIDO');
    expect(report.campos.some((c) => c.estado === 'VERIFICADO')).toBe(false);
    expect(report.problemas.some((p) => p.nivel === 'ERROR' && p.mensaje.includes('inventados'))).toBe(true);
  });

  it('el país nunca queda verificado: solo puede coincidir con la MRZ', () => {
    const base = passport();
    const report = buildPassportExtractionReport(
      passport({
        viz: { ...base.viz, codigoPaisEmisor: text('BLZ') },
        mrz: {
          lineas: [
            'P<BLZERIKSSON<<ANNA<MARIA'.padEnd(44, '<'),
            'L898902C36BLZ7408122F1204159ZE184226B<<<<<10',
          ],
          confianza: 'ALTA',
        },
      }),
      TODAY,
    );
    expect(report.mrz.valida).toBe(true);
    expect(report.campos.find((c) => c.campo === 'codigoPaisEmisor')?.estado).toBe('COINCIDE');
  });
});
