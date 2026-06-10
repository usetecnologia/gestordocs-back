import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { COUNTRY_REPOSITORY } from './domain/country.repository';
import { CountryPrismaRepository } from './infrastructure/persistence/country.prisma.repository';
import { CountryController } from './infrastructure/http/country.controller';
import { CreateCountryUseCase } from './application/use-cases/create-country.use-case';
import { FindAllCountryUseCase } from './application/use-cases/find-all-country.use-case';
import { FindActiveCountryUseCase } from './application/use-cases/find-active-country.use-case';
import { FindOneCountryUseCase } from './application/use-cases/find-one-country.use-case';
import { UpdateCountryUseCase } from './application/use-cases/update-country.use-case';
import { DeleteCountryUseCase } from './application/use-cases/delete-country.use-case';

const useCases = [
  CreateCountryUseCase,
  FindAllCountryUseCase,
  FindActiveCountryUseCase,
  FindOneCountryUseCase,
  UpdateCountryUseCase,
  DeleteCountryUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [CountryController],
  providers: [
    ...useCases,
    { provide: COUNTRY_REPOSITORY, useClass: CountryPrismaRepository },
    JwtAuthGuard,
  ],
})
export class CountryModule {}
