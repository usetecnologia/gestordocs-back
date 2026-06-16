import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { UpdateUserProfileDto } from '../../infrastructure/http/dtos/update-user-profile.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class UpdateUserProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
  ) {}

  async execute({ userId, ...data }: UpdateUserProfileDto): Promise<User> {
    const existing = await this.repo.findById(userId);
    if (!existing)
      throw new NotFoundException(`Usuario #${userId} no encontrado.`);
    return this.repo.update(userId, data);
  }
}
