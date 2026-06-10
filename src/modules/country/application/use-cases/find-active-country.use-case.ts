import { Inject, Injectable } from '@nestjs/common';
import { ICountryRepository, COUNTRY_REPOSITORY } from '../../domain/country.repository';
import type { Country } from '../../domain/country.entity';

@Injectable()
export class FindActiveCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  execute(): Promise<Country[]> {
    return this.repo.findAllActive();
  }
}
