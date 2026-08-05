import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import * as mime from 'mime-types';
import { envs } from '@config/envs';
import {
  detectFileType,
  extensionFromFilename,
} from '@common/utils/file-type.util';
import { S3UploadFile, S3UploadResult } from './interfaces/s3-upload.interface';

@Injectable()
export class AwsS3Service {
  private readonly client: S3Client;
  private readonly bucket = envs.AWS_S3_BUCKET;

  constructor() {
    this.client = new S3Client({
      region: envs.AWS_REGION,
      credentials: {
        accessKeyId: envs.AWS_ACCESS_KEY_ID,
        secretAccessKey: envs.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadOne(
    file: S3UploadFile,
    folder?: string,
  ): Promise<S3UploadResult> {
    // El Content-Type se toma del CONTENIDO real del archivo, no de su nombre. Deducirlo de la
    // extensión guardaba, por ejemplo, un JPEG llamado "pasaporte.pdf" como "application/pdf": el
    // navegador se lo entregaba al visor de PDF y el documento quedaba imposible de ver, aunque el
    // archivo estuviera perfecto. Solo si la firma de bytes no se reconoce se recurre al nombre y
    // al mimetype declarado por el cliente.
    const detected = detectFileType(file.buffer);
    const nameExt = extensionFromFilename(file.originalname);

    const ext = detected?.extension ?? nameExt ?? 'bin';
    // `mime.lookup` devuelve `false` cuando no conoce la extensión, así que la cadena usa `||`:
    // con `??` un `false` cortaría el encadenamiento en vez de pasar al siguiente candidato.
    const contentType =
      detected?.contentType ||
      (nameExt ? mime.lookup(nameExt) : false) ||
      file.mimetype ||
      'application/octet-stream';

    const key = folder
      ? `${folder}/${randomUUID()}.${ext}`
      : `${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
      }),
    );

    const url = `https://${this.bucket}.s3.${envs.AWS_REGION}.amazonaws.com/${key}`;
    return { url, key };
  }

  async downloadOne(url: string): Promise<Buffer> {
    const key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
}
