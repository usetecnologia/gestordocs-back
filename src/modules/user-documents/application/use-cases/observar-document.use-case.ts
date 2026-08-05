import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { resolveCurrentFileUrl } from '../../domain/user-document-file';
import type { MulterFile } from '../../domain/multer-file.interface';
import type { ObservarDocumentDto } from '../../infrastructure/http/dtos/review-document.dto';

@Injectable()
export class ObservarDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(
    dto: ObservarDocumentDto,
    reviewedById: string,
    files?: MulterFile[],
  ): Promise<void> {
    const userDoc = await this.userDocumentsRepo.findByIdWithHistory(
      dto.userDocumentId,
    );
    if (!userDoc)
      throw new NotFoundException(
        `UserDocument #${dto.userDocumentId} not found`,
      );

    let fileUrls: string[] = [];
    if (files?.length) {
      const uploads = await Promise.all(
        files.map((f) => this.awsS3Service.uploadOne(f, 'observation-files')),
      );
      fileUrls = uploads.map((r) => r.url);
    }

    await this.userDocumentsRepo.observarDocument({
      userDocumentId: dto.userDocumentId,
      observation: dto.observation,
      etiquetaIds: dto.etiquetaIds,
      reviewedById,
      url: resolveCurrentFileUrl(userDoc.history),
      files: fileUrls,
    });
  }
}
