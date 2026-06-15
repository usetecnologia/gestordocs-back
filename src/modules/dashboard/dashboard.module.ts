import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { WORKUSE_GENERIC_PORT } from './domain/workuse-generic.port';
import { WorkuseGenericClient } from './infrastructure/external/workuse-generic.client';
import { DashboardController } from './infrastructure/http/dashboard.controller';
import { LinkDataUseCase } from './application/use-cases/link-data.use-case';
import { COUNTRY_REPOSITORY } from '@modules/country/domain/country.repository';
import { CountryPrismaRepository } from '@modules/country/infrastructure/persistence/country.prisma.repository';
import { PROGRAM_REPOSITORY } from '@modules/program/domain/program.repository';
import { ProgramPrismaRepository } from '@modules/program/infrastructure/persistence/program.prisma.repository';
import { SPONSOR_REPOSITORY } from '@modules/sponsor/domain/sponsor.repository';
import { SponsorPrismaRepository } from '@modules/sponsor/infrastructure/persistence/sponsor.prisma.repository';

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [DashboardController],
  providers: [
    LinkDataUseCase,
    { provide: WORKUSE_GENERIC_PORT, useClass: WorkuseGenericClient },
    { provide: COUNTRY_REPOSITORY, useClass: CountryPrismaRepository },
    { provide: PROGRAM_REPOSITORY, useClass: ProgramPrismaRepository },
    { provide: SPONSOR_REPOSITORY, useClass: SponsorPrismaRepository },
    JwtAuthGuard,
  ],
})
export class DashboardModule {}
