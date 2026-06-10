import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SPONSOR_REPOSITORY, ISponsorRepository } from '../../domain/sponsor.repository';

@Injectable()
export class DeleteSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Sponsor #${id} no encontrado.`);
    await this.repo.delete(id);
  }
}
