import { Inject, Injectable } from '@nestjs/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain/user.repository';
import { TerminarRevisionUseCase } from '@modules/user-documents/application/use-cases/terminar-revision.use-case';

@Injectable()
export class CloseObservationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repo: IUserRepository,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
  ) {}

  async execute(observationId: string, createdById?: string): Promise<void> {
    const userId = await this.repo.closeObservation(observationId);
    await this.terminarRevisionUseCase.execute(userId, createdById);
  }
}
