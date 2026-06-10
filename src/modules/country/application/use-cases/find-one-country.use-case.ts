import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { COUNTRY_REPOSITORY, ICountryRepository } from '../../domain/country.repository';
import type { Country } from '../../domain/country.entity';

@Injectable()
export class FindOneCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  async execute(id: string): Promise<Country> {
    const country = await this.repo.findById(id);
    if (!country) throw new NotFoundException(`País #${id} no encontrado.`);
    return country;
  }
}
