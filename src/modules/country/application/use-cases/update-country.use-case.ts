import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { COUNTRY_REPOSITORY, ICountryRepository } from '../../domain/country.repository';
import type { UpdateCountryDto } from '../../infrastructure/http/dtos/update-country.dto';
import type { Country } from '../../domain/country.entity';

@Injectable()
export class UpdateCountryUseCase {
  constructor(
    @Inject(COUNTRY_REPOSITORY)
    private readonly repo: ICountryRepository,
  ) {}

  async execute(id: string, dto: UpdateCountryDto): Promise<Country> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`País #${id} no encontrado.`);

    if (dto.code && (await this.repo.isCodeTaken(dto.code, id))) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }

    return this.repo.update(id, dto);
  }
}
