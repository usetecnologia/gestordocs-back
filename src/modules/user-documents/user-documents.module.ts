import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { ResendModule } from '@shared/resend/resend.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import { DocumentPrismaRepository } from '@modules/document/infrastructure/persistence/document.prisma.repository';
import { EMAIL_ACTION_REPOSITORY } from '@modules/email-action/domain/email-action.repository';
import { EmailActionPrismaRepository } from '@modules/email-action/infrastructure/persistence/email-action.prisma.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from '@modules/email-template/domain/email-template.repository';
import { EmailTemplatePrismaRepository } from '@modules/email-template/infrastructure/persistence/email-template.prisma.repository';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import { USER_DOCUMENTS_REPOSITORY } from './domain/user-documents.repository';
import { USER_STATUS_PORT } from './domain/user-status.port';
import { UserDocumentsPrismaRepository } from './infrastructure/persistence/user-documents.prisma.repository';
import { UserStatusPrisma } from './infrastructure/persistence/user-status.prisma';
import { UserDocumentsController } from './infrastructure/http/user-documents.controller';
import { UploadFileDocumentUseCase } from './application/use-cases/upload-file-document.use-case';
import { FindUserDocumentsUseCase } from './application/use-cases/find-user-documents.use-case';
import { SyncUserDocumentsUseCase } from './application/use-cases/sync-user-documents.use-case';
import { AceptarDocumentUseCase } from './application/use-cases/aceptar-document.use-case';
import { ObservarDocumentUseCase } from './application/use-cases/observar-document.use-case';
import { BulkUploadByFilenameUseCase } from './application/use-cases/bulk-upload-by-filename.use-case';
import { TerminarRevisionUseCase } from './application/use-cases/terminar-revision.use-case';
import { BulkTerminarRevisionUseCase } from './application/use-cases/bulk-terminar-revision.use-case';
import { DownloadDocumentsBySponsorUseCase } from './application/use-cases/download-documents-by-sponsor.use-case';
import { BulkDownloadDocumentsBySponsorUseCase } from './application/use-cases/bulk-download-documents-by-sponsor.use-case';
import { FindInformativeDocumentsBySponsorsUseCase } from './application/use-cases/find-informative-documents-by-sponsors.use-case';
import { BulkAceptarDocumentUseCase } from './application/use-cases/bulk-aceptar-document.use-case';
import { BulkObservarDocumentUseCase } from './application/use-cases/bulk-observar-document.use-case';
import { SponsorDocumentBuilder } from './application/services/sponsor-document-builder.service';

@Module({
  imports: [PrismaModule, AppJwtModule, AwsS3Module, ResendModule],
  controllers: [UserDocumentsController],
  providers: [
    UploadFileDocumentUseCase,
    FindUserDocumentsUseCase,
    SyncUserDocumentsUseCase,
    AceptarDocumentUseCase,
    ObservarDocumentUseCase,
    BulkUploadByFilenameUseCase,
    TerminarRevisionUseCase,
    BulkTerminarRevisionUseCase,
    DownloadDocumentsBySponsorUseCase,
    BulkDownloadDocumentsBySponsorUseCase,
    FindInformativeDocumentsBySponsorsUseCase,
    BulkAceptarDocumentUseCase,
    BulkObservarDocumentUseCase,
    SponsorDocumentBuilder,
    EmailDispatchService,
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    { provide: USER_STATUS_PORT, useClass: UserStatusPrisma },
    { provide: EMAIL_ACTION_REPOSITORY, useClass: EmailActionPrismaRepository },
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: EmailTemplatePrismaRepository },
    JwtAuthGuard,
  ],
})
export class UserDocumentsModule {}
