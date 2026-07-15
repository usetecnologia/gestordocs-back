import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { EMAIL_ACTION_REPOSITORY } from './domain/email-action.repository';
import { EmailActionPrismaRepository } from './infrastructure/persistence/email-action.prisma.repository';
import { EmailActionController } from './infrastructure/http/email-action.controller';
import { FindActiveEmailActionUseCase } from './application/use-cases/find-active-email-action.use-case';

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [EmailActionController],
  providers: [
    FindActiveEmailActionUseCase,
    { provide: EMAIL_ACTION_REPOSITORY, useClass: EmailActionPrismaRepository },
    JwtAuthGuard,
  ],
  exports: [EMAIL_ACTION_REPOSITORY],
})
export class EmailActionModule {}
