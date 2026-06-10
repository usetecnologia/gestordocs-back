import { Inject, Injectable } from '@nestjs/common';
import { ISponsorRepository, SPONSOR_REPOSITORY } from '../../domain/sponsor.repository';
import type { Sponsor } from '../../domain/sponsor.entity';

@Injectable()
export class FindActiveSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  execute(): Promise<Sponsor[]> {
    return this.repo.findAllActive();
  }
}
