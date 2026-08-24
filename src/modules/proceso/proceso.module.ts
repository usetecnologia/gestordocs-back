import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { PROCESO_REPOSITORY } from './domain/proceso.repository';
import { ProcesoPrismaRepository } from './infrastructure/persistence/proceso.prisma.repository';
import { ProcesoController } from './infrastructure/http/proceso.controller';
import { EnsureProcesoInicialUseCase } from './application/use-cases/ensure-proceso-inicial.use-case';
import { CrearNuevoProcesoUseCase } from './application/use-cases/crear-nuevo-proceso.use-case';
import { FinalizarProcesoUseCase } from './application/use-cases/finalizar-proceso.use-case';
import { ContinuarProcesoUseCase } from './application/use-cases/continuar-proceso.use-case';
import { FindHistorialProcesosUseCase } from './application/use-cases/find-historial-procesos.use-case';

const useCases = [
  EnsureProcesoInicialUseCase,
  CrearNuevoProcesoUseCase,
  FinalizarProcesoUseCase,
  ContinuarProcesoUseCase,
  FindHistorialProcesosUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [ProcesoController],
  providers: [
    ...useCases,
    { provide: PROCESO_REPOSITORY, useClass: ProcesoPrismaRepository },
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class ProcesoModule {}
