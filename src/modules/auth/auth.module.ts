import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { AUTH_REPOSITORY } from './domain/auth.repository';
import { AUTH_TOKEN_STORE } from './domain/auth-token-store.port';
import { PASSWORD_VERIFIER } from './domain/password-verifier.port';
import { AuthPrismaRepository } from './infrastructure/persistence/auth.prisma.repository';
import { AuthTokenStoreRedis } from './infrastructure/persistence/auth-token-store.redis';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';

const useCases = [LoginUseCase, RefreshTokenUseCase, LogoutUseCase];

@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule],
  controllers: [AuthController],
  providers: [
    ...useCases,
    { provide: AUTH_REPOSITORY, useClass: AuthPrismaRepository },
    { provide: AUTH_TOKEN_STORE, useClass: AuthTokenStoreRedis },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
  ],
  exports: [AppJwtModule],
})
export class AuthModule {}
