import { Inject, Injectable } from '@nestjs/common';
import { AI_REVIEW_REPOSITORY, AiReviewItem, IAiReviewRepository } from '../../domain/ai-review.repository';

@Injectable()
export class FindAiReviewsUseCase {
  constructor(@Inject(AI_REVIEW_REPOSITORY) private readonly aiReviewRepo: IAiReviewRepository) {}

  execute(userId: string): Promise<AiReviewItem[]> {
    return this.aiReviewRepo.findLatestByUserId(userId);
  }
}
