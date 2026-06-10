import { Inject, Injectable } from '@nestjs/common';
import { SPONSOR_REPOSITORY, ISponsorRepository } from '../../domain/sponsor.repository';
import type { FindSponsorsQueryDto } from '../../infrastructure/http/dtos/find-sponsors-query.dto';
import type { Sponsor } from '../../domain/sponsor.entity';

@Injectable()
export class FindAllSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  execute(query: FindSponsorsQueryDto): Promise<{ data: Sponsor[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
  }
}
