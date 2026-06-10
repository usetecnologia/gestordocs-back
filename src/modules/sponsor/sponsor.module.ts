import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { SPONSOR_REPOSITORY } from './domain/sponsor.repository';
import { SponsorPrismaRepository } from './infrastructure/persistence/sponsor.prisma.repository';
import { SponsorController } from './infrastructure/http/sponsor.controller';
import { CreateSponsorUseCase } from './application/use-cases/create-sponsor.use-case';
import { FindAllSponsorUseCase } from './application/use-cases/find-all-sponsor.use-case';
import { FindActiveSponsorUseCase } from './application/use-cases/find-active-sponsor.use-case';
import { FindOneSponsorUseCase } from './application/use-cases/find-one-sponsor.use-case';
import { UpdateSponsorUseCase } from './application/use-cases/update-sponsor.use-case';
import { DeleteSponsorUseCase } from './application/use-cases/delete-sponsor.use-case';

const useCases = [
  CreateSponsorUseCase,
  FindAllSponsorUseCase,
  FindActiveSponsorUseCase,
  FindOneSponsorUseCase,
  UpdateSponsorUseCase,
  DeleteSponsorUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [SponsorController],
  providers: [
    ...useCases,
    { provide: SPONSOR_REPOSITORY, useClass: SponsorPrismaRepository },
    JwtAuthGuard,
  ],
})
export class SponsorModule {}
