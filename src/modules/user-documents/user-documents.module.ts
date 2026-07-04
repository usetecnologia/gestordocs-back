import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import { DocumentPrismaRepository } from '@modules/document/infrastructure/persistence/document.prisma.repository';
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

@Module({
  imports: [PrismaModule, AppJwtModule, AwsS3Module],
  controllers: [UserDocumentsController],
  providers: [
    UploadFileDocumentUseCase,
    FindUserDocumentsUseCase,
    SyncUserDocumentsUseCase,
    AceptarDocumentUseCase,
    ObservarDocumentUseCase,
    BulkUploadByFilenameUseCase,
    TerminarRevisionUseCase,
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    { provide: USER_STATUS_PORT, useClass: UserStatusPrisma },
    JwtAuthGuard,
  ],
})
export class UserDocumentsModule {}
