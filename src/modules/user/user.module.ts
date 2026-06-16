import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/prisma/prisma.module';
import { AppJwtModule } from '@shared/jwt/jwt.module';
import { BcryptModule } from '@shared/bcrypt/bcrypt.module';
import { BcryptService } from '@shared/bcrypt/bcrypt.service';
import { AwsS3Module } from '@shared/aws/aws-s3.module';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { USER_REPOSITORY } from './domain/user.repository';
import { PASSWORD_HASHER } from './domain/password-hasher.port';
import { PASSWORD_VERIFIER } from './domain/password-verifier.port';
import { UserPrismaRepository } from './infrastructure/persistence/user.prisma.repository';
import { UserController } from './infrastructure/http/user.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { FindAllUserUseCase } from './application/use-cases/find-all-user.use-case';
import { FindOneUserUseCase } from './application/use-cases/find-one-user.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { DeleteUserUseCase } from './application/use-cases/delete-user.use-case';
import { UpdateUserProfileUseCase } from './application/use-cases/update-user-profile.use-case';
import { UploadAvatarUseCase } from './application/use-cases/upload-avatar.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ChangeUserStatusUseCase } from './application/use-cases/change-user-status.use-case';

const useCases = [
  CreateUserUseCase,
  FindAllUserUseCase,
  FindOneUserUseCase,
  UpdateUserUseCase,
  DeleteUserUseCase,
  UpdateUserProfileUseCase,
  UploadAvatarUseCase,
  ChangePasswordUseCase,
  ChangeUserStatusUseCase,
];

@Module({
  imports: [PrismaModule, AppJwtModule, BcryptModule, AwsS3Module],
  controllers: [UserController],
  providers: [
    ...useCases,
    { provide: USER_REPOSITORY, useClass: UserPrismaRepository },
    { provide: PASSWORD_HASHER, useClass: BcryptService },
    { provide: PASSWORD_VERIFIER, useClass: BcryptService },
    JwtAuthGuard,
  ],
})
export class UserModule {}
