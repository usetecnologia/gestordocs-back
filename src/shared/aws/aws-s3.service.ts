import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { envs } from '@config/envs';
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

  async uploadOne(file: S3UploadFile, folder?: string): Promise<S3UploadResult> {
    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = folder ? `${folder}/${randomUUID()}.${ext}` : `${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = `https://${this.bucket}.s3.${envs.AWS_REGION}.amazonaws.com/${key}`;
    return { url, key };
  }
}
