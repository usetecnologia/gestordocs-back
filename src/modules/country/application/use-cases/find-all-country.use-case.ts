import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_REPOSITORY, ICountryRepository } from '../../domain/country.repository';
import type { FindCountriesQueryDto } from '../../infrastructure/http/dtos/find-countries-query.dto';
import type { Country } from '../../domain/country.entity';

@Injectable()
export class FindAllCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  execute(query: FindCountriesQueryDto): Promise<{ data: Country[]; total: number }> {
    return this.repo.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    });
  }
}
