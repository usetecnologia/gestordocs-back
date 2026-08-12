import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../domain/password-hasher.port';
import type { AdminChangePasswordDto } from '../../infrastructure/http/dtos/admin-change-password.dto';

@Injectable()
export class AdminChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute({ userId, newPassword }: AdminChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException(`Usuario #${userId} no encontrado.`);

    if (user.role?.name === 'Participante') {
      throw new BadRequestException(
        'No se puede cambiar la contraseña de un participante mediante este endpoint.',
      );
    }

    const hashed = await this.hasher.hash(newPassword);
    await this.repo.update(userId, { password: hashed });
  }
}
