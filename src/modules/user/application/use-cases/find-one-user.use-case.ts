import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { User } from '../../domain/user.entity';

@Injectable()
export class FindOneUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  async execute(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado.`);
    return user;
  }
}
