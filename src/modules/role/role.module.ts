import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { ROLE_REPOSITORY } from './domain/role.repository';
import { RolePrismaRepository } from './infrastructure/persistence/role.prisma.repository';
import { RoleController } from './infrastructure/http/role.controller';
import { CreateRoleUseCase } from './application/use-cases/create-role.use-case';
import { FindAllRoleUseCase } from './application/use-cases/find-all-role.use-case';
import { FindActiveRoleUseCase } from './application/use-cases/find-active-role.use-case';
import { FindOneRoleUseCase } from './application/use-cases/find-one-role.use-case';
import { UpdateRoleUseCase } from './application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from './application/use-cases/delete-role.use-case';

const useCases = [
  CreateRoleUseCase,
  FindAllRoleUseCase,
  FindActiveRoleUseCase,
  FindOneRoleUseCase,
  UpdateRoleUseCase,
  DeleteRoleUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule],
  controllers: [RoleController],
  providers: [
    ...useCases,
    { provide: ROLE_REPOSITORY, useClass: RolePrismaRepository },
    JwtAuthGuard,
  ],
  exports: [FindOneRoleUseCase],
})
export class RoleModule {}
