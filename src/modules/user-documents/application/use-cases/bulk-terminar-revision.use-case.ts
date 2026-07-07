import { Inject, Injectable } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import { TerminarRevisionUseCase } from './terminar-revision.use-case';

const ADMIN_CREATED_BY_ID = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';
const CONCURRENCY = 10;

export interface BulkTerminarRevisionResult {
  total: number;
  processed: number;
  errors: { participantId: string; message: string }[];
}

@Injectable()
export class BulkTerminarRevisionUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    private readonly terminarRevisionUseCase: TerminarRevisionUseCase,
  ) {}

  async execute(): Promise<BulkTerminarRevisionResult> {
    const participantIds = await this.userDocumentsRepo.findAllParticipantIds();

    const errors: { participantId: string; message: string }[] = [];
    let processed = 0;

    for (let i = 0; i < participantIds.length; i += CONCURRENCY) {
      const batch = participantIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((participantId) =>
          this.terminarRevisionUseCase.execute(participantId, ADMIN_CREATED_BY_ID),
        ),
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          errors.push({
            participantId: batch[index],
            message: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
        }
      });
    }

    return { total: participantIds.length, processed, errors };
  }
}
