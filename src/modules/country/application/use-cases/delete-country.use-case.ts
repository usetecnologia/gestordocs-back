import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { COUNTRY_REPOSITORY, ICountryRepository } from '../../domain/country.repository';

@Injectable()
export class DeleteCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`País #${id} no encontrado.`);
    await this.repo.delete(id);
  }
}
