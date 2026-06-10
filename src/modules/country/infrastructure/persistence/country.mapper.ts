import type { CountryModel } from 'prisma/generated/prisma/models';
import { Country } from '../../domain/country.entity';

export class CountryMapper {
  static toDomain(raw: CountryModel): Country {
    return new Country(
      raw.id,
      raw.code,
      raw.name,
      raw.currency ?? null,
      raw.countryCode ?? null,
      raw.status,
      raw.createAt,
      raw.updateAt,
    );
  }
}
