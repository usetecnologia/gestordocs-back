import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { COUNTRY_REPOSITORY, ICountryRepository } from '../../domain/country.repository';
import type { CreateCountryDto } from '../../infrastructure/http/dtos/create-country.dto';
import type { Country } from '../../domain/country.entity';

@Injectable()
export class CreateCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  async execute(dto: CreateCountryDto): Promise<Country> {
    if (await this.repo.isCodeTaken(dto.code)) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }
    return this.repo.create(dto);
  }
}
