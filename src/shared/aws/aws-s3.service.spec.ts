import { AwsS3Service } from './aws-s3.service';

jest.mock('@config/envs', () => ({
  envs: {
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    AWS_S3_BUCKET: 'test-bucket',
  },
}));

/**
 * Regresión: el Content-Type se deducía de la extensión del nombre del archivo. Un JPEG llamado
 * "pasaporte.pdf" se guardaba en S3 como "application/pdf", el navegador se lo pasaba al visor de
 * PDF y el documento quedaba imposible de ver aunque el archivo estuviera intacto (5 pasaportes
 * afectados entre el 1 y el 3 de julio de 2026).
 */

interface ComandoS3 {
  input: { Key: string; ContentType: string };
}

function servicioConCaptura() {
  const service = new AwsS3Service();
  const enviados: ComandoS3['input'][] = [];

  (
    service as unknown as {
      client: { send: (c: ComandoS3) => Promise<unknown> };
    }
  ).client = {
    send: (command: ComandoS3) => {
      enviados.push(command.input);
      return Promise.resolve({});
    },
  };

  return { service, enviados };
}

const archivo = (
  nombre: string,
  bytes: Buffer,
  mimetype = 'application/octet-stream',
) => ({
  buffer: bytes,
  mimetype,
  originalname: nombre,
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xbc]);
const PDF = Buffer.from('%PDF-1.7\n', 'latin1');

describe('AwsS3Service.uploadOne', () => {
  it('guarda un JPEG llamado .pdf con su tipo real y extensión corregida', async () => {
    const { service, enviados } = servicioConCaptura();

    const { url } = await service.uploadOne(
      archivo('pasaporte.pdf', JPEG, 'application/pdf'),
      'user-documents/bulk',
    );

    expect(enviados[0].ContentType).toBe('image/jpeg');
    expect(enviados[0].Key).toMatch(/^user-documents\/bulk\/[\w-]+\.jpg$/);
    expect(url).toContain(enviados[0].Key);
  });

  it('guarda un PDF llamado .jpg con su tipo real y extensión corregida', async () => {
    const { service, enviados } = servicioConCaptura();

    await service.uploadOne(
      archivo('dni.jpg', PDF, 'image/jpeg'),
      'user-documents',
    );

    expect(enviados[0].ContentType).toBe('application/pdf');
    expect(enviados[0].Key).toMatch(/\.pdf$/);
  });

  it('no altera nada cuando el nombre y el contenido ya coinciden', async () => {
    const { service, enviados } = servicioConCaptura();

    await service.uploadOne(archivo('foto.jpg', JPEG, 'image/jpeg'));

    expect(enviados[0].ContentType).toBe('image/jpeg');
    expect(enviados[0].Key).toMatch(/^[\w-]+\.jpg$/);
  });

  it('cae a la extensión del nombre cuando la firma de bytes no se reconoce', async () => {
    const { service, enviados } = servicioConCaptura();

    await service.uploadOne(
      archivo('planilla.xlsx', Buffer.from('contenido cualquiera')),
    );

    expect(enviados[0].ContentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(enviados[0].Key).toMatch(/\.xlsx$/);
  });

  it('cae al mimetype declarado si ni los bytes ni el nombre dicen nada', async () => {
    const { service, enviados } = servicioConCaptura();

    await service.uploadOne(
      archivo('archivo-sin-extension', Buffer.from('xyz'), 'text/plain'),
    );

    expect(enviados[0].ContentType).toBe('text/plain');
    expect(enviados[0].Key).toMatch(/\.bin$/);
  });
});
