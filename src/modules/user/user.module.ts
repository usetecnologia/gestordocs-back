import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { ResendModule } from '@shared/resend/resend.module';
import { WorkuseModule } from '@shared/workuse/workuse.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import { DocumentPrismaRepository } from '@modules/document/infrastructure/persistence/document.prisma.repository';
import { USER_DOCUMENTS_REPOSITORY } from '@modules/user-documents/domain/user-documents.repository';
import { UserDocumentsPrismaRepository } from '@modules/user-documents/infrastructure/persistence/user-documents.prisma.repository';
import { USER_STATUS_PORT } from '@modules/user-documents/domain/user-status.port';
import { UserStatusPrisma } from '@modules/user-documents/infrastructure/persistence/user-status.prisma';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { AUTOLOGIN_REPOSITORY } from '@modules/auth/domain/autologin.repository';
import { AutoLoginPrismaRepository } from '@modules/auth/infrastructure/persistence/autologin.prisma.repository';
import { EMAIL_ACTION_REPOSITORY } from '@modules/email-action/domain/email-action.repository';
import { EmailActionPrismaRepository } from '@modules/email-action/infrastructure/persistence/email-action.prisma.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from '@modules/email-template/domain/email-template.repository';
import { EmailTemplatePrismaRepository } from '@modules/email-template/infrastructure/persistence/email-template.prisma.repository';
import { EMAIL_LOG_REPOSITORY } from '@modules/email-template/domain/email-log.repository';
import { EmailLogPrismaRepository } from '@modules/email-template/infrastructure/persistence/email-log.prisma.repository';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import { EmailLogService } from '@modules/email-template/application/services/email-log.service';
import { USER_REPOSITORY } from './domain/user.repository';
import { PASSWORD_HASHER } from './domain/password-hasher.port';
import { PASSWORD_VERIFIER } from './domain/password-verifier.port';
import { UserPrismaRepository } from './infrastructure/persistence/user.prisma.repository';
import { UserController } from './infrastructure/http/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { FindAllUserUseCase } from './application/use-cases/find-all-user.use-case';
import { FindAllStaffUseCase } from './application/use-cases/find-all-staff.use-case';
import { FindOneUserUseCase } from './application/use-cases/find-one-user.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile.use-case';
import { UploadAvatarUseCase } from './application/use-cases/upload-avatar.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { AdminChangePasswordUseCase } from './application/use-cases/admin-change-password.use-case';
import { ChangeUserStatusUseCase } from './application/use-cases/change-user-status.use-case';
import { CreateObservationUseCase } from './application/use-cases/create-observation.use-case';
import { CloseObservationUseCase } from './application/use-cases/close-observation.use-case';
import { BulkLoadUsersUseCase } from './application/use-cases/bulk-load-users.use-case';
import { BulkInfoParticipantsUseCase } from './application/use-cases/bulk-info-participants.use-case';
import { InfoParticipantUseCase } from './application/use-cases/info-participant.use-case';
import { ExportParticipantsDocumentsUseCase } from './application/use-cases/export-participants-documents.use-case';
import { BulkInfoParticipantsSchedulerService } from './application/services/bulk-info-participants.scheduler.service';

const useCases = [
  CreateUserUseCase,
  FindAllUserUseCase,
  FindAllStaffUseCase,
  FindOneUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  UpdateUserProfileUseCase,
  UploadAvatarUseCase,
  ChangePasswordUseCase,
  AdminChangePasswordUseCase,
  ChangeUserStatusUseCase,
  CreateObservationUseCase,
  CloseObservationUseCase,
  BulkLoadUsersUseCase,
  BulkInfoParticipantsUseCase,
  InfoParticipantUseCase,
  ExportParticipantsDocumentsUseCase,
  TerminarRevisionUseCase,
  SyncUserDocumentsUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule, AwsS3Module, ResendModule, WorkuseModule],
  controllers: [UserController],
  providers: [
    ...useCases,
    BulkInfoParticipantsSchedulerService,
    EmailDispatchService,
    EmailLogService,
    { provide: USER_REPOSITORY, useClass: UserPrismaRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptService },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    { provide: USER_STATUS_PORT, useClass: UserStatusPrisma },
    { provide: AUTOLOGIN_REPOSITORY, useClass: AutoLoginPrismaRepository },
    { provide: EMAIL_ACTION_REPOSITORY, useClass: EmailActionPrismaRepository },
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: EmailTemplatePrismaRepository },
    { provide: EMAIL_LOG_REPOSITORY, useClass: EmailLogPrismaRepository },
    JwtAuthGuard,
  ],
})
export class UserModule {}
