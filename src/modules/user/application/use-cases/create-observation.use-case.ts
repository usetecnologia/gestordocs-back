import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { formatObservationsList } from '@common/utils/template-variables.util';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
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
    private readonly emailDispatchService: EmailDispatchService,
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

    const result = await this.repo.createObservation({
      participantId: dto.participantId,
      observation: dto.observation,
      createdById: dto.createdById,
      etiquetaIds: dto.etiquetaIds,
      files: fileUrls,
    });

    const activeObservations = await this.repo.findActiveObservationTexts(dto.participantId);
    const observacionesUsuario = formatObservationsList(activeObservations);

    await this.emailDispatchService.dispatchByActionCode('USER_OBSERVADO', {
      email: user.email,
      userId: user.id,
      nombreParticipante: [user.firstname, user.middlename, user.lastfathername, user.lastmothername]
        .filter(Boolean)
        .join(' '),
      nombrePrograma: user.program?.name,
      nombreSponsor: user.sponsor?.name,
      observacionesUsuario,
    });

    return result;
  }
}
