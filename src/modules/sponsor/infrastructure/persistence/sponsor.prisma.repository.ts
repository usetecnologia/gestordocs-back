import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  ISponsorRepository,
  SponsorFilters,
  CreateSponsorData,
  UpdateSponsorData,
} from '../../domain/sponsor.repository';
import { Sponsor } from '../../domain/sponsor.entity';
import { SponsorMapper } from './sponsor.mapper';

@Injectable()
export class SponsorPrismaRepository implements ISponsorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, search }: SponsorFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && {
        OR: [{ name: { contains: search } }, { code: { contains: search } }],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sponsor.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createAt: 'desc' },
      }),
      this.prisma.sponsor.count({ where }),
    ]);

    return { data: data.map(SponsorMapper.toDomain), total };
  }

  async findAllActive(): Promise<Sponsor[]> {
    const rows = await this.prisma.sponsor.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(SponsorMapper.toDomain);
  }

  async findById(id: string): Promise<Sponsor | null> {
    const row = await this.prisma.sponsor.findUnique({ where: { id } });
    return row ? SponsorMapper.toDomain(row) : null;
  }

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.sponsor.findFirst({
      where: { code, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async create(data: CreateSponsorData): Promise<Sponsor> {
    const row = await this.prisma.sponsor.create({ data });
    return SponsorMapper.toDomain(row);
  }

  async update(id: string, data: UpdateSponsorData): Promise<Sponsor> {
    const row = await this.prisma.sponsor.update({ where: { id }, data });
    return SponsorMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.sponsor.delete({ where: { id } });
  }
}
