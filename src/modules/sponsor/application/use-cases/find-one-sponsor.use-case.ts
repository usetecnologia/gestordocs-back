import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SPONSOR_REPOSITORY, ISponsorRepository } from '../../domain/sponsor.repository';
import type { Sponsor } from '../../domain/sponsor.entity';

@Injectable()
export class FindOneSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  async execute(id: string): Promise<Sponsor> {
    const sponsor = await this.repo.findById(id);
    if (!sponsor) throw new NotFoundException(`Sponsor #${id} no encontrado.`);
    return sponsor;
  }
}
