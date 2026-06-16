import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ETIQUETA_REPOSITORY } from './domain/etiqueta.repository';
import { EtiquetaPrismaRepository } from './infrastructure/persistence/etiqueta.prisma.repository';
import { EtiquetaController } from './infrastructure/http/etiqueta.controller';
import { CreateEtiquetaUseCase } from './application/use-cases/create-etiqueta.use-case';
import { FindAllEtiquetaUseCase } from './application/use-cases/find-all-etiqueta.use-case';
import { FindActiveEtiquetaUseCase } from './application/use-cases/find-active-etiqueta.use-case';
import { FindOneEtiquetaUseCase } from './application/use-cases/find-one-etiqueta.use-case';
import { UpdateEtiquetaUseCase } from './application/use-cases/update-etiqueta.use-case';
import { DeleteEtiquetaUseCase } from './application/use-cases/delete-etiqueta.use-case';

const useCases = [
  CreateEtiquetaUseCase,
  FindAllEtiquetaUseCase,
  FindActiveEtiquetaUseCase,
  FindOneEtiquetaUseCase,
  UpdateEtiquetaUseCase,
  DeleteEtiquetaUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [EtiquetaController],
  providers: [
    ...useCases,
    { provide: ETIQUETA_REPOSITORY, useClass: EtiquetaPrismaRepository },
    JwtAuthGuard,
  ],
})
export class EtiquetaModule {}
