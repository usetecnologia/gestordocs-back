import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  IUserRepository,
  ObservationResult,
  USER_REPOSITORY,
} from '../../domain/user.repository';
import type { MulterFile } from '../../domain/multer-file.interface';
import { CreateObservationDto } from '../../infrastructure/http/dtos/create-observation.dto';

@Injectable()
export class CreateObservationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(dto: CreateObservationDto, files?: MulterFile[]): Promise<ObservationResult> {
    const user = await this.repo.findById(dto.participantId);
    if (!user) throw new NotFoundException(`Usuario #${dto.participantId} no encontrado.`);

    let fileUrls: string[] = [];
    if (files?.length) {
      const uploads = await Promise.all(
        files.map((f) => this.awsS3Service.uploadOne(f, 'observation-files')),
      );
      fileUrls = uploads.map((r) => r.url);
    }

    return this.repo.createObservation({
      participantId: dto.participantId,
      observation: dto.observation,
      createdById: dto.createdById,
      etiquetaIds: dto.etiquetaIds,
      files: fileUrls,
    });
  }
}
