import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { SPONSOR_REPOSITORY, ISponsorRepository } from '../../domain/sponsor.repository';
import type { CreateSponsorDto } from '../../infrastructure/http/dtos/create-sponsor.dto';
import type { Sponsor } from '../../domain/sponsor.entity';

@Injectable()
export class CreateSponsorUseCase {
  constructor(
    @Inject(SPONSOR_REPOSITORY)
    private readonly repo: ISponsorRepository,
  ) {}

  async execute(dto: CreateSponsorDto): Promise<Sponsor> {
    if (await this.repo.isCodeTaken(dto.code)) {
      throw new ConflictException(`El código '${dto.code}' ya está en uso.`);
    }
    return this.repo.create(dto);
  }
}
