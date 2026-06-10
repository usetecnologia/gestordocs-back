import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import { IPasswordHasher, PASSWORD_HASHER } from '../../domain/password-hasher.port';
import type { CreateUserDto } from '../../infrastructure/http/dtos/create-user.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
  ) {}

  async execute(dto: CreateUserDto): Promise<User> {
    const password = dto.password ? await this.hasher.hash(dto.password) : undefined;
    return this.repo.create({ ...dto, password });
  }
}
