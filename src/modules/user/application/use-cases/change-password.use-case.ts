import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/password-hasher.port';
import {
  IPasswordVerifier,
  PASSWORD_VERIFIER,
} from '../../domain/password-verifier.port';
import type { ChangePasswordDto } from '../../infrastructure/http/dtos/change-password.dto';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(PASSWORD_VERIFIER) private readonly verifier: IPasswordVerifier,
  ) {}

  async execute({
    userId,
    currentPassword,
    newPassword,
  }: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException(`Usuario #${userId} no encontrado.`);
    if (!user.password) {
      throw new BadRequestException(
        'El usuario no tiene una contraseña configurada.',
      );
    }

    const isValid = await this.verifier.compare(currentPassword, user.password);
    if (!isValid)
      throw new UnauthorizedException('La contraseña actual es incorrecta.');

    const hashed = await this.hasher.hash(newPassword);
    await this.repo.update(userId, { password: hashed });
  }
}
