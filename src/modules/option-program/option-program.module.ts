import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { OPTION_PROGRAM_REPOSITORY } from './domain/option-program.repository';
import { OptionProgramPrismaRepository } from './infrastructure/persistence/option-program.prisma.repository';
import { OptionProgramController } from './infrastructure/http/option-program.controller';
import { CreateOptionProgramUseCase } from './application/use-cases/create-option-program.use-case';
import { FindAllOptionProgramUseCase } from './application/use-cases/find-all-option-program.use-case';
import { FindOneOptionProgramUseCase } from './application/use-cases/find-one-option-program.use-case';
import { UpdateOptionProgramUseCase } from './application/use-cases/update-option-program.use-case';
import { DeleteOptionProgramUseCase } from './application/use-cases/delete-option-program.use-case';

const useCases = [
  CreateOptionProgramUseCase,
  FindAllOptionProgramUseCase,
  FindOneOptionProgramUseCase,
  UpdateOptionProgramUseCase,
  DeleteOptionProgramUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [OptionProgramController],
  providers: [
    ...useCases,
    { provide: OPTION_PROGRAM_REPOSITORY, useClass: OptionProgramPrismaRepository },
    JwtAuthGuard,
  ],
})
export class OptionProgramModule {}
