import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { AUTH_REPOSITORY } from './domain/auth.repository';
import { PASSWORD_VERIFIER } from './domain/password-verifier.port';
import { AuthPrismaRepository } from './infrastructure/persistence/auth.prisma.repository';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';

const useCases = [LoginUseCase, RefreshTokenUseCase];

@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule],
  controllers: [AuthController],
  providers: [
    ...useCases,
    { provide: AUTH_REPOSITORY, useClass: AuthPrismaRepository },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
  ],
  exports: [AppJwtModule],
})
export class AuthModule {}
