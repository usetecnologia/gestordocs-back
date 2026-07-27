import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { TEMPORADA_REPOSITORY } from './domain/temporada.repository';
import { TemporadaPrismaRepository } from './infrastructure/persistence/temporada.prisma.repository';
import { TemporadaController } from './infrastructure/http/temporada.controller';
import { CreateTemporadaUseCase } from './application/use-cases/create-temporada.use-case';
import { FindAllTemporadaUseCase } from './application/use-cases/find-all-temporada.use-case';
import { FindActiveTemporadasUseCase } from './application/use-cases/find-active-temporadas.use-case';
import { FindOneTemporadaUseCase } from './application/use-cases/find-one-temporada.use-case';
import { UpdateTemporadaUseCase } from './application/use-cases/update-temporada.use-case';
import { ToggleTemporadaStatusUseCase } from './application/use-cases/toggle-temporada-status.use-case';
import { DeleteTemporadaUseCase } from './application/use-cases/delete-temporada.use-case';

const useCases = [
  CreateTemporadaUseCase,
  FindAllTemporadaUseCase,
  FindActiveTemporadasUseCase,
  FindOneTemporadaUseCase,
  UpdateTemporadaUseCase,
  ToggleTemporadaStatusUseCase,
  DeleteTemporadaUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [TemporadaController],
  providers: [
    ...useCases,
    { provide: TEMPORADA_REPOSITORY, useClass: TemporadaPrismaRepository },
    JwtAuthGuard,
  ],
})
export class TemporadaModule {}
