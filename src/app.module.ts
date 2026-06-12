import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { envs } from './config/envs';
import { AuthModule } from '@modules/auth/auth.module';
import { CountryModule } from '@modules/country/country.module';
import { DocumentModule } from '@modules/document/document.module';
import { OptionProgramModule } from '@modules/option-program/option-program.module';
import { ProgramModule } from '@modules/program/program.module';
import { RoleModule } from '@modules/role/role.module';
import { SponsorModule } from '@modules/sponsor/sponsor.module';
import { UserModule } from '@modules/user/user.module';

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
    AuthModule,
    CountryModule,
    DocumentModule,
    OptionProgramModule,
    ProgramModule,
    RoleModule,
    SponsorModule,
    UserModule,
  ],
})
export class AppModule {}
