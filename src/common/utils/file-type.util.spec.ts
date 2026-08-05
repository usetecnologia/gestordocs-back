import {
  breaksRendering,
  detectFileType,
  extensionFromFilename,
  normalizeContentType,
  renderingFamily,
} from './file-type.util';

/**
 * Casos tomados de archivos reales del bucket: pasaportes subidos con la extensión equivocada, que
 * quedaron guardados con un Content-Type que no correspondía a su contenido y dejaron de poder
 * visualizarse en el navegador.
 */

const bytes = (...values: number[]) => Buffer.from(values);
const conTexto = (texto: string, relleno = 0) =>
  Buffer.concat([Buffer.from(texto, 'latin1'), Buffer.alloc(relleno)]);

describe('detectFileType', () => {
  it('reconoce un PDF', () => {
    expect(detectFileType(conTexto('%PDF-1.7'))).toEqual({
      contentType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('reconoce un JPEG (el caso del pasaporte guardado como .pdf)', () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe1))).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('reconoce un PNG', () => {
    expect(
      detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toEqual({ contentType: 'image/png', extension: 'png' });
  });

  it('reconoce un WEBP y no lo confunde con otro contenedor RIFF', () => {
    expect(detectFileType(conTexto('RIFF\x00\x00\x00\x00WEBP'))).toEqual({
      contentType: 'image/webp',
      extension: 'webp',
    });
    expect(detectFileType(conTexto('RIFF\x00\x00\x00\x00WAVE'))).toBeNull();
  });

  it('reconoce un HEIC de iPhone', () => {
    expect(detectFileType(conTexto('\x00\x00\x00\x18ftypheic'))).toEqual({
      contentType: 'image/heic',
      extension: 'heic',
    });
  });

  it('devuelve null cuando la firma no corresponde a ningún formato conocido', () => {
    expect(detectFileType(conTexto('esto es texto plano'))).toBeNull();
  });

  it('no revienta con archivos vacíos o más cortos que la firma', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType(bytes(0xff, 0xd8))).toBeNull();
  });

  it('exige la cabecera BMP completa para no aceptar cualquier archivo que empiece con "BM"', () => {
    expect(detectFileType(conTexto('BM', 12))?.contentType).toBe('image/bmp');
    expect(detectFileType(conTexto('BM'))).toBeNull();
  });
});

describe('extensionFromFilename', () => {
  it('devuelve la extensión en minúsculas', () => {
    expect(extensionFromFilename('pasaporte.PDF')).toBe('pdf');
    expect(extensionFromFilename('12345678_PASSPORT.jpg')).toBe('jpg');
  });

  it('usa la última extensión en nombres con varios puntos', () => {
    expect(extensionFromFilename('acta.2026.final.pdf')).toBe('pdf');
  });

  it('devuelve null cuando no hay extensión real', () => {
    expect(extensionFromFilename('archivo-sin-extension')).toBeNull();
    expect(extensionFromFilename('termina-en-punto.')).toBeNull();
    expect(extensionFromFilename('.gitignore')).toBeNull();
  });
});

describe('normalizeContentType', () => {
  it('unifica los alias de JPEG', () => {
    expect(normalizeContentType('image/pjpeg')).toBe('image/jpeg');
    expect(normalizeContentType('image/jpg')).toBe('image/jpeg');
  });

  it('quita los parámetros y normaliza mayúsculas', () => {
    expect(normalizeContentType('IMAGE/JPEG')).toBe('image/jpeg');
    expect(normalizeContentType('application/pdf; charset=binary')).toBe(
      'application/pdf',
    );
    expect(normalizeContentType('  image/png  ')).toBe('image/png');
  });

  it('deja intacto un tipo que ya es canónico', () => {
    expect(normalizeContentType('application/pdf')).toBe('application/pdf');
  });
});

describe('renderingFamily', () => {
  it('clasifica por cómo lo muestra el navegador', () => {
    expect(renderingFamily('application/pdf')).toBe('pdf');
    expect(renderingFamily('image/pjpeg')).toBe('image');
    expect(renderingFamily('image/heic')).toBe('image');
    expect(renderingFamily('application/octet-stream')).toBe('other');
    expect(renderingFamily('text/plain')).toBe('other');
  });
});

/**
 * Los casos vienen de la corrida del 4/8/2026: 35 mismatches detectados, de los que solo 5 impedían
 * ver el archivo. Los otros 30 (29 jpeg→png y 1 pjpeg→jpeg) eran observaciones por nada.
 */
describe('breaksRendering', () => {
  it('reporta un PDF servido como imagen (los 3 casos invisibles desde el 3 de julio)', () => {
    expect(breaksRendering('image/jpeg', 'application/pdf')).toBe(true);
  });

  it('reporta un JPEG servido como PDF', () => {
    expect(breaksRendering('application/pdf', 'image/jpeg')).toBe(true);
  });

  it('ignora un desajuste entre imágenes: el navegador acierta por sniffing', () => {
    expect(breaksRendering('image/jpeg', 'image/png')).toBe(false);
    expect(breaksRendering('image/png', 'image/webp')).toBe(false);
  });

  it('ignora el alias pjpeg → jpeg, que era el mismo formato', () => {
    expect(breaksRendering('image/pjpeg', 'image/jpeg')).toBe(false);
  });

  it('no reporta nada cuando el tipo declarado coincide', () => {
    expect(breaksRendering('application/pdf', 'application/pdf')).toBe(false);
    expect(breaksRendering('IMAGE/JPEG', 'image/jpeg')).toBe(false);
  });

  it('reporta un tipo que el navegador no renderiza siendo el archivo visible', () => {
    expect(breaksRendering('text/plain', 'image/jpeg')).toBe(true);
    expect(breaksRendering('application/msword', 'application/pdf')).toBe(true);
  });
});
