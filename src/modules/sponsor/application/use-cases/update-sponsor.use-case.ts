import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SPONSOR_REPOSITORY, ISponsorRepository } from '../../domain/sponsor.repository';
import type { UpdateSponsorDto } from '../../infrastructure/http/dtos/update-sponsor.dto';
import type { Sponsor } from '../../domain/sponsor.entity';

@Injectable()
export class UpdateSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  async execute(id: string, dto: UpdateSponsorDto): Promise<Sponsor> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException(`Sponsor #${id} no encontrado.`);

    if (dto.code && (await this.repo.isCodeTaken(dto.code, id))) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }

    return this.repo.update(id, dto);
  }
}
