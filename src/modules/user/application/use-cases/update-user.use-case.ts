import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';
import type { UpdateUserDto } from '../../infrastructure/http/dtos/update-user.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(id: string, dto: UpdateUserDto): Promise<User> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Usuario #${id} no encontrado.`);

    // Un string vacío es la señal explícita del frontend para limpiar el campo (dejarlo en null).
    const username = dto.username === '' ? null : dto.username;
    const email = dto.email === '' ? null : dto.email;

    if (username && (await this.repo.isUsernameTaken(username, id))) {
      throw new ConflictException('El nombre de usuario ya está en uso.');
    }
    if (email && (await this.repo.isEmailTaken(email, id))) {
      throw new ConflictException('El correo electrónico ya está en uso.');
    }

    const password = dto.password ? await this.hasher.hash(dto.password) : undefined;
    return this.repo.update(id, { ...dto, username, email, password });
  }
}
