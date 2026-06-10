import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  ICountryRepository,
  CountryFilters,
  CreateCountryData,
  UpdateCountryData,
} from '../../domain/country.repository';
import { Country } from '../../domain/country.entity';
import { CountryMapper } from './country.mapper';

@Injectable()
export class CountryPrismaRepository implements ICountryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, search }: CountryFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { code: { contains: search } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.country.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createAt: 'desc' },
      }),
      this.prisma.country.count({ where }),
    ]);

    return { data: data.map(CountryMapper.toDomain), total };
  }

  async findAllActive(): Promise<Country[]> {
    const rows = await this.prisma.country.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(CountryMapper.toDomain);
  }

  async findById(id: string): Promise<Country | null> {
    const row = await this.prisma.country.findUnique({ where: { id } });
    return row ? CountryMapper.toDomain(row) : null;
  }

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.country.findFirst({
      where: { code, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async create(data: CreateCountryData): Promise<Country> {
    const row = await this.prisma.country.create({ data });
    return CountryMapper.toDomain(row);
  }

  async update(id: string, data: UpdateCountryData): Promise<Country> {
    const row = await this.prisma.country.update({ where: { id }, data });
    return CountryMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.country.delete({ where: { id } });
  }
}
