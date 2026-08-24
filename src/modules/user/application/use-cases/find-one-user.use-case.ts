import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import type { User } from '../../domain/user.entity';

@Injectable()
export class FindOneUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  /**
   * `procesoId` acota el detalle a un ciclo archivado, para revisarlo desde el listado. Sin él se
   * muestra el ciclo en curso.
   */
  async execute(id: string, procesoId?: string): Promise<User> {
    const user = await this.repo.findById(id, procesoId);
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado.`);
    return user;
  }
}
