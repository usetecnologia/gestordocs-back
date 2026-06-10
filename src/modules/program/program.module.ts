import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PROGRAM_REPOSITORY } from './domain/program.repository';
import { ProgramPrismaRepository } from './infrastructure/persistence/program.prisma.repository';
import { ProgramController } from './infrastructure/http/program.controller';
import { CreateProgramUseCase } from './application/use-cases/create-program.use-case';
import { FindAllProgramUseCase } from './application/use-cases/find-all-program.use-case';
import { FindActiveProgramUseCase } from './application/use-cases/find-active-program.use-case';
import { FindOneProgramUseCase } from './application/use-cases/find-one-program.use-case';
import { UpdateProgramUseCase } from './application/use-cases/update-program.use-case';
import { DeleteProgramUseCase } from './application/use-cases/delete-program.use-case';

const useCases = [
  CreateProgramUseCase,
  FindAllProgramUseCase,
  FindActiveProgramUseCase,
  FindOneProgramUseCase,
  UpdateProgramUseCase,
  DeleteProgramUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [ProgramController],
  providers: [
    ...useCases,
    { provide: PROGRAM_REPOSITORY, useClass: ProgramPrismaRepository },
    JwtAuthGuard,
  ],
})
export class ProgramModule {}
