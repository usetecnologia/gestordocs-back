import type { SponsorModel } from 'prisma/generated/prisma/models';
import { Sponsor } from '../../domain/sponsor.entity';

export class SponsorMapper {
  static toDomain(raw: SponsorModel): Sponsor {
    return new Sponsor(raw.id, raw.idExterno ?? null, raw.code, raw.name, raw.status, raw.createAt, raw.updateAt);
  }
}
