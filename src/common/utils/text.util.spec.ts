import {
  MYSQL_TEXT_MAX_BYTES,
  exceedsByteLimit,
  truncateToBytes,
} from './text.util';

/**
 * El caso que motiva esto: los motivos que la revisión masiva concatenaba superaban el límite de la
 * columna y hacían fallar el INSERT dentro de la transacción, perdiendo también el cambio de estado.
 */

describe('truncateToBytes', () => {
  it('devuelve el texto intacto cuando ya cabe', () => {
    expect(truncateToBytes('observación breve', 100)).toBe('observación breve');
  });

  it('devuelve el texto intacto cuando ocupa exactamente el límite', () => {
    // 'ñ' ocupa 2 bytes en UTF-8: 'añ' son 3.
    expect(truncateToBytes('añ', 3)).toBe('añ');
  });

  it('recorta al límite de bytes, no de caracteres', () => {
    const texto = 'áéíóú'; // 5 caracteres, 10 bytes
    expect(Buffer.byteLength(texto, 'utf8')).toBe(10);

    const recortado = truncateToBytes(texto, 6);
    expect(recortado).toBe('áéí');
    expect(Buffer.byteLength(recortado, 'utf8')).toBe(6);
  });

  it('no parte un carácter multibyte por la mitad', () => {
    // Cortar 'añ' a 2 bytes caería dentro de la 'ñ': debe quedarse en 'a'.
    const recortado = truncateToBytes('añ', 2);
    expect(recortado).toBe('a');
    expect(recortado).not.toContain('�');
  });

  it('no parte un emoji de 4 bytes', () => {
    const texto = 'ok👍';
    expect(Buffer.byteLength(texto, 'utf8')).toBe(6);

    for (const limite of [2, 3, 4, 5]) {
      const recortado = truncateToBytes(texto, limite);
      expect(recortado).toBe('ok');
      expect(recortado).not.toContain('�');
    }
    expect(truncateToBytes(texto, 6)).toBe(texto);
  });

  it('devuelve string vacío con un límite de 0 o negativo', () => {
    expect(truncateToBytes('texto', 0)).toBe('');
    expect(truncateToBytes('texto', -5)).toBe('');
  });

  it('usa el límite de TEXT por defecto', () => {
    const largo = 'a'.repeat(MYSQL_TEXT_MAX_BYTES + 500);
    expect(truncateToBytes(largo)).toHaveLength(MYSQL_TEXT_MAX_BYTES);
    expect(truncateToBytes('corto')).toBe('corto');
  });

  it('recorta un motivo real que excedía el varchar(191) previo', () => {
    const motivo =
      'El participante era menor de edad al emitirse el pasaporte. ' +
      'El archivo está guardado con un tipo de contenido declarado ("image/jpeg") que no ' +
      'corresponde a su contenido real ("application/pdf"), lo que puede impedir su visualización.';

    expect(exceedsByteLimit(motivo, 191)).toBe(true);
    expect(
      Buffer.byteLength(truncateToBytes(motivo, 191), 'utf8'),
    ).toBeLessThanOrEqual(191);
  });
});

describe('exceedsByteLimit', () => {
  it('mide en bytes, no en caracteres', () => {
    const texto = 'ñ'.repeat(100); // 100 caracteres, 200 bytes
    expect(exceedsByteLimit(texto, 191)).toBe(true);
    expect(exceedsByteLimit('a'.repeat(100), 191)).toBe(false);
  });

  it('el límite exacto no se considera excedido', () => {
    expect(exceedsByteLimit('añ', 3)).toBe(false);
  });
});
