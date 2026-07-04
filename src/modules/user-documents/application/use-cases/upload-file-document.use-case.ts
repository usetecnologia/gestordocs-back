import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import { MulterFile } from '../../domain/multer-file.interface';
import { UploadFileDocumentDto } from '../../infrastructure/http/dtos/upload-file-document.dto';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { IUserStatusPort, USER_STATUS_PORT } from '../../domain/user-status.port';

@Injectable()
export class UploadFileDocumentUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(USER_STATUS_PORT)
    private readonly userStatusPort: IUserStatusPort,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async execute(file: MulterFile, dto: UploadFileDocumentDto): Promise<void> {
    const userDoc = await this.userDocumentsRepo.findByIdWithHistory(dto.userDocumentId);
    if (!userDoc) throw new NotFoundException(`UserDocument #${dto.userDocumentId} not found`);

    const uploaderRole = dto.userCreatedId
      ? await this.userStatusPort.getRole(dto.userCreatedId)
      : null;

    const isParticipant = uploaderRole === 'Participante';

    if (isParticipant) {
      const BLOCKED_STATUSES: Record<string, string> = {
        EN_REVISION:       'Tus documentos están en revisión, por favor espere.',
        PREPARACION:       'Tu expediente está en preparación, no puedes subir documentos.',
        ENVIADO_SPONSOR:   'Tu expediente ya fue enviado al sponsor, no puedes subir documentos.',
        RECHAZADO_SPONSOR: 'Tu expediente fue rechazado por el sponsor, no puedes subir documentos.',
        APROBADO_SPONSOR:  'Tu expediente ya fue aprobado por el sponsor, no puedes subir documentos.',
        RETIRADO:          'Tu expediente está retirado, no puedes subir documentos.',
      };

      const currentStatus = await this.userStatusPort.getStatus(userDoc.userId);
      if (currentStatus && BLOCKED_STATUSES[currentStatus]) {
        throw new ConflictException(BLOCKED_STATUSES[currentStatus]);
      }
    }

    const { url } = await this.awsS3Service.uploadOne(file, 'user-documents');

    await this.userDocumentsRepo.addHistory(userDoc.id, 'SUBIDO', url, dto.userCreatedId);

    if (isParticipant) {
      const { totalRequired, submittedRequired } = await this.userDocumentsRepo.countRequiredDocs(
        userDoc.userId,
      );

      console.log(totalRequired, submittedRequired)

      const newUserStatus =
        totalRequired === 0 || submittedRequired === totalRequired
          ? 'PENDIENTE_REVISAR'
          : 'DOCUMENTOS_INCOMPLETOS';

      await this.userStatusPort.updateStatus(userDoc.userId, newUserStatus, dto.userCreatedId ?? undefined);
    }
  }
}
