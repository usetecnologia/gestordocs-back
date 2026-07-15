import { Injectable } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import type { MulterFile } from '../../domain/multer-file.interface';

export interface UploadImagenResult {
  url: string;
}

@Injectable()
export class UploadImagenEmailTemplateUseCase {
  constructor(private readonly awsS3Service: AwsS3Service) {}

  async execute(file: MulterFile): Promise<UploadImagenResult> {
    const { url } = await this.awsS3Service.uploadOne(file, 'email-templates');
    return { url };
  }
}
