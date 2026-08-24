import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { USER_DOCUMENTS_REPOSITORY } from '@modules/user-documents/domain/user-documents.repository';
import { UserDocumentsPrismaRepository } from '@modules/user-documents/infrastructure/persistence/user-documents.prisma.repository';
import { DOCUMENT_REPOSITORY } from '@modules/document/domain/document.repository';
import { DocumentPrismaRepository } from '@modules/document/infrastructure/persistence/document.prisma.repository';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
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
    // `CrearNuevoProceso` sincroniza el expediente del ciclo nuevo, así que el módulo provee el
    // sync y sus dos repositorios. Mismo patrón que auth y user: los repositorios se re-proveen por
    // módulo en vez de exportarse.
    SyncUserDocumentsUseCase,
    { provide: PROCESO_REPOSITORY, useClass: ProcesoPrismaRepository },
    { provide: USER_DOCUMENTS_REPOSITORY, useClass: UserDocumentsPrismaRepository },
    { provide: DOCUMENT_REPOSITORY, useClass: DocumentPrismaRepository },
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class ProcesoModule {}
