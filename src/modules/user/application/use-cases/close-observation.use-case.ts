import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';

@Injectable()
export class CloseObservationUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: IUserRepository) {}

  execute(observationId: string, createdById?: string): Promise<void> {
    return this.repo.closeObservation(observationId, createdById);
  }
}
