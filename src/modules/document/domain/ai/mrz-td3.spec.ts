import { assembleTd3Line2, computeCheckDigit, mrzDateToIso, readTd3Mrz } from './mrz-td3';

// Ejemplo oficial de ICAO Doc 9303 parte 4.
const LINE_1 = 'P<UTOERIKSSON<<ANNA<MARIA'.padEnd(44, '<');
const LINE_2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
const TODAY = new Date(Date.UTC(2026, 9, 21));

describe('computeCheckDigit', () => {
  it('calcula los dígitos del ejemplo ICAO', () => {
    expect(computeCheckDigit('L898902C3')).toBe(6);
    expect(computeCheckDigit('740812')).toBe(2);
    expect(computeCheckDigit('120415')).toBe(9);
  });

  it('devuelve null con caracteres ilegibles', () => {
    expect(computeCheckDigit('L89?902C3')).toBeNull();
  });
});

describe('mrzDateToIso', () => {
  it('ubica el nacimiento en el siglo pasado si el año sería futuro', () => {
    expect(mrzDateToIso('740812', 'nacimiento', TODAY)).toBe('1974-08-12');
    expect(mrzDateToIso('050101', 'nacimiento', TODAY)).toBe('2005-01-01');
  });

  it('toma el vencimiento siempre en el siglo actual', () => {
    expect(mrzDateToIso('740812', 'vencimiento', TODAY)).toBe('2074-08-12');
  });

  it('rechaza fechas imposibles', () => {
    expect(mrzDateToIso('740231', 'nacimiento', TODAY)).toBeNull();
  });
});

describe('readTd3Mrz', () => {
  it('lee y valida una MRZ correcta', () => {
    const result = readTd3Mrz([LINE_1, LINE_2], TODAY);
    expect(result.estado).toBe('LEIDA');
    if (result.estado !== 'LEIDA') return;
    expect(result.valida).toBe(true);
    expect(result.campos).toMatchObject({
      codigoPaisEmisor: 'UTO',
      apellidos: 'ERIKSSON',
      nombres: 'ANNA MARIA',
      numeroPasaporte: 'L898902C3',
      fechaNacimiento: '1974-08-12',
      sexo: 'F',
      fechaVencimiento: '2012-04-15',
    });
  });

  it('tolera espacios y minúsculas en la transcripción', () => {
    const result = readTd3Mrz([LINE_1.toLowerCase(), LINE_2.replace('UTO', 'U T O')], TODAY);
    expect(result.estado === 'LEIDA' && result.valida).toBe(true);
  });

  it('detecta un carácter mal transcrito en el número', () => {
    const result = readTd3Mrz([LINE_1, LINE_2.replace('L898902C3', 'L898902G3')], TODAY);
    expect(result.estado).toBe('LEIDA');
    if (result.estado !== 'LEIDA') return;
    expect(result.valida).toBe(false);
    expect(result.checks.find((c) => c.campo === 'numeroPasaporte')?.valido).toBe(false);
    expect(result.checks.find((c) => c.campo === 'fechaNacimiento')?.valido).toBe(true);
  });

  it('informa ausencia y formato inválido', () => {
    expect(readTd3Mrz([], TODAY).estado).toBe('AUSENTE');
    // Sin tramo de "<" que ajustar, una línea corta no se puede leer.
    expect(readTd3Mrz([LINE_1, 'L898902C36UTO7408122F'], TODAY).estado).toBe('FORMATO_INVALIDO');
    // Con relleno se ajusta la longitud, pero los dígitos de control delatan lo que falta.
    const truncated = readTd3Mrz([LINE_1, LINE_2.slice(0, 40)], TODAY);
    expect(truncated.estado === 'LEIDA' && truncated.valida).toBe(false);
    expect(readTd3Mrz([LINE_1], TODAY).estado).toBe('FORMATO_INVALIDO');
  });
});

describe('readTd3Mrz — relleno mal contado', () => {
  it('corrige un "<" de más o de menos si los dígitos de control lo confirman', () => {
    const extra = LINE_2.replace('B<<<<<1', 'B<<<<<<1');
    const missing = LINE_1.slice(0, 40);
    const result = readTd3Mrz([missing, extra], TODAY);
    expect(result.estado).toBe('LEIDA');
    if (result.estado !== 'LEIDA') return;
    expect(result.rellenoAjustado).toBe(true);
    expect(result.valida).toBe(true);
    expect(result.lineas).toEqual([LINE_1, LINE_2]);
  });

  it('no da por válida una línea ajustada si los dígitos no coinciden', () => {
    const corrupted = LINE_2.replace('B<<<<<1', 'B<<<<<<1').replace('L898902C3', 'L898902G3');
    const result = readTd3Mrz([LINE_1, corrupted], TODAY);
    expect(result.estado === 'LEIDA' && result.valida).toBe(false);
  });
});

describe('readTd3Mrz — número personal', () => {
  it('ignora un número personal demasiado corto (relleno mal leído)', () => {
    const line2 = 'L898902C36UTO7408122F1204159<<<<<<<<<<<<<00' + '0';
    const result = readTd3Mrz([LINE_1, line2.slice(0, 44)], TODAY);
    expect(result.estado).toBe('LEIDA');
    if (result.estado === 'LEIDA') expect(result.campos.numeroPersonal).toBe('');
  });
});

describe('assembleTd3Line2', () => {
  const FIELDS = {
    numero: 'L898902C3',
    digitoNumero: '6',
    nacionalidad: 'UTO',
    nacimiento: '740812',
    digitoNacimiento: '2',
    sexo: 'F',
    vencimiento: '120415',
    digitoVencimiento: '9',
    numeroPersonal: 'ZE184226B',
    digitoPersonal: '1',
    digitoFinal: '0',
  };

  it('arma la línea 2 con el relleno correcto', () => {
    expect(assembleTd3Line2(FIELDS)).toBe(LINE_2);
  });

  it('si falta un dígito, la línea no supera la verificación (no se inventa)', () => {
    const line = assembleTd3Line2({ ...FIELDS, digitoNacimiento: '' });
    const result = readTd3Mrz([LINE_1, line], TODAY);
    expect(result.estado === 'LEIDA' && result.valida).toBe(false);
  });
});
