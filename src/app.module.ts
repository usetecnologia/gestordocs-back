import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import KeyvRedis from '@keyv/redis';
import { envs } from './config/envs';
import { AuthModule } from '@modules/auth/auth.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { CountryModule } from '@modules/country/country.module';
import { DocumentModule } from '@modules/document/document.module';
import { EmailActionModule } from '@modules/email-action/email-action.module';
import { EmailTemplateModule } from '@modules/email-template/email-template.module';
import { EtiquetaModule } from '@modules/etiqueta/etiqueta.module';
import { MailTestModule } from '@modules/mail-test/mail-test.module';
import { OptionProgramModule } from '@modules/option-program/option-program.module';
import { ProgramModule } from '@modules/program/program.module';
import { RoleModule } from '@modules/role/role.module';
import { SponsorModule } from '@modules/sponsor/sponsor.module';
import { UserModule } from '@modules/user/user.module';
import { UserDocumentsModule } from '@modules/user-documents/user-documents.module';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        ttl: 5000,
        stores: [
          new KeyvRedis({
            url: envs.REDIS_URL,
            socket: { connectTimeout: 3000, reconnectStrategy: false },
          }),
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    CountryModule,
    DashboardModule,
    DocumentModule,
    EmailActionModule,
    EmailTemplateModule,
    EtiquetaModule,
    MailTestModule,
    OptionProgramModule,
    ProgramModule,
    RoleModule,
    SponsorModule,
    UserModule,
    UserDocumentsModule,
  ],
})
export class AppModule {}
