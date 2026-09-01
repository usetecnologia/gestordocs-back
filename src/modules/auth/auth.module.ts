import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { ResendModule } from '@shared/resend/resend.module';
import { WorkuseModule } from '@shared/workuse/workuse.module';
import { IntranetModule } from '@shared/intranet/intranet.module';
import { AUTH_REPOSITORY } from './domain/auth.repository';
import { PASSWORD_VERIFIER } from './domain/password-verifier.port';
import { PASSWORD_HASHER } from './domain/password-hasher.port';
import { AUTOLOGIN_REPOSITORY } from './domain/autologin.repository';
import { AuthPrismaRepository } from './infrastructure/persistence/auth.prisma.repository';
import { AutoLoginPrismaRepository } from './infrastructure/persistence/autologin.prisma.repository';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { AutoLoginUseCase } from './application/use-cases/autologin.use-case';
import { IntranetLoginUseCase } from './application/use-cases/intranet-login.use-case';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';
import { USER_DOCUMENTS_REPOSITORY } from '@modules/user-documents/domain/user-documents.repository';
import { UserDocumentsPrismaRepository } from '@modules/user-documents/infrastructure/persistence/user-documents.prisma.repository';
import { USER_STATUS_PORT } from '@modules/user-documents/domain/user-status.port';
import { UserStatusPrisma } from '@modules/user-documents/infrastructure/persistence/user-status.prisma';
import { DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import { DocumentPrismaRepository } from '@modules/document/infrastructure/persistence/document.prisma.repository';
import { EMAIL_ACTION_REPOSITORY } from '@modules/email-action/domain/email-action.repository';
import { EmailActionPrismaRepository } from '@modules/email-action/infrastructure/persistence/email-action.prisma.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from '@modules/email-template/domain/email-template.repository';
import { EmailTemplatePrismaRepository } from '@modules/email-template/infrastructure/persistence/email-template.prisma.repository';
import { EMAIL_LOG_REPOSITORY } from '@modules/email-template/domain/email-log.repository';
import { EmailLogPrismaRepository } from '@modules/email-template/infrastructure/persistence/email-log.prisma.repository';
import { EmailDispatchService } from '@modules/email-template/application/services/email-dispatch.service';
import { EmailLogService } from '@modules/email-template/application/services/email-log.service';

const useCases = [
  LoginUseCase,
  RefreshTokenUseCase,
  AutoLoginUseCase,
  IntranetLoginUseCase,
  SyncUserDocumentsUseCase,
  TerminarRevisionUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule, ResendModule, WorkuseModule, IntranetModule],
  controllers: [AuthController],
  providers: [
    ...useCases,
    EmailDispatchService,
    EmailLogService,
    { provide: AUTH_REPOSITORY, useClass: AuthPrismaRepository },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
    { provide: PASSWORD_HASHER, useClass: BcryptService },
    { provide: AUTOLOGIN_REPOSITORY, useClass: AutoLoginPrismaRepository },
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    { provide: USER_STATUS_PORT, useClass: UserStatusPrisma },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    { provide: EMAIL_ACTION_REPOSITORY, useClass: EmailActionPrismaRepository },
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: EmailTemplatePrismaRepository },
    { provide: EMAIL_LOG_REPOSITORY, useClass: EmailLogPrismaRepository },
  ],
  exports: [AppJwtModule],
})
export class AuthModule {}
