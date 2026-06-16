import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { ChangeUserStatusDto } from '../../infrastructure/http/dtos/change-user-status.dto';
import type { User } from '../../domain/user.entity';

@Injectable()
export class ChangeUserStatusUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
  ) {}

  async execute({
    userId,
    currentStatus,
    newStatus,
  }: ChangeUserStatusDto): Promise<User> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException(`Usuario #${userId} no encontrado.`);

    if (user.status !== currentStatus) {
      throw new ConflictException(
        `El estado actual del usuario es '${user.status}', no '${currentStatus}'.`,
      );
    }

    const updated = await this.repo.update(userId, { status: newStatus });
    await this.repo.addStatusHistory(userId, newStatus);
    return updated;
  }
}
