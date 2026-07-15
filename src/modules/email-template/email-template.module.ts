import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { ResendModule } from '@shared/resend/resend.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { EMAIL_ACTION_REPOSITORY } from '@modules/email-action/domain/email-action.repository';
import { EmailActionPrismaRepository } from '@modules/email-action/infrastructure/persistence/email-action.prisma.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from './domain/email-template.repository';
import { EMAIL_AUDIENCE_REPOSITORY } from './domain/email-audience.repository';
import { EMAIL_LOG_REPOSITORY } from './domain/email-log.repository';
import { EmailTemplatePrismaRepository } from './infrastructure/persistence/email-template.prisma.repository';
import { EmailAudiencePrismaRepository } from './infrastructure/persistence/email-audience.prisma.repository';
import { EmailLogPrismaRepository } from './infrastructure/persistence/email-log.prisma.repository';
import { EmailTemplateController } from './infrastructure/http/email-template.controller';
import { CreateEmailTemplateUseCase } from './application/use-cases/create-email-template.use-case';
import { FindAllEmailTemplateUseCase } from './application/use-cases/find-all-email-template.use-case';
import { FindOneEmailTemplateUseCase } from './application/use-cases/find-one-email-template.use-case';
import { UpdateEmailTemplateUseCase } from './application/use-cases/update-email-template.use-case';
import { DeleteEmailTemplateUseCase } from './application/use-cases/delete-email-template.use-case';
import { UploadImagenEmailTemplateUseCase } from './application/use-cases/upload-imagen-email-template.use-case';
import { FindTemplateVariablesUseCase } from './application/use-cases/find-template-variables.use-case';
import { EmailDispatchService } from './application/services/email-dispatch.service';
import { EmailScheduleService } from './application/services/email-schedule.service';
import { EmailLogService } from './application/services/email-log.service';

const useCases = [
  CreateEmailTemplateUseCase,
  FindAllEmailTemplateUseCase,
  FindOneEmailTemplateUseCase,
  UpdateEmailTemplateUseCase,
  DeleteEmailTemplateUseCase,
  UploadImagenEmailTemplateUseCase,
  FindTemplateVariablesUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule, AwsS3Module, ResendModule],
  controllers: [EmailTemplateController],
  providers: [
    ...useCases,
    EmailDispatchService,
    EmailScheduleService,
    EmailLogService,
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: EmailTemplatePrismaRepository },
    { provide: EMAIL_ACTION_REPOSITORY, useClass: EmailActionPrismaRepository },
    { provide: EMAIL_AUDIENCE_REPOSITORY, useClass: EmailAudiencePrismaRepository },
    { provide: EMAIL_LOG_REPOSITORY, useClass: EmailLogPrismaRepository },
    JwtAuthGuard,
  ],
  exports: [EmailDispatchService, EMAIL_TEMPLATE_REPOSITORY, EMAIL_ACTION_REPOSITORY],
})
export class EmailTemplateModule {}
