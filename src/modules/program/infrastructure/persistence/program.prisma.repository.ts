import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IProgramRepository,
  ProgramFilters,
  CreateProgramData,
  UpdateProgramData,
} from '../../domain/program.repository';
import { Program } from '../../domain/program.entity';
import { ProgramMapper } from './program.mapper';

@Injectable()
export class ProgramPrismaRepository implements IProgramRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, search }: ProgramFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && {
        OR: [{ name: { contains: search } }, { code: { contains: search } }],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.program.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createAt: 'desc' },
      }),
      this.prisma.program.count({ where }),
    ]);

    return { data: data.map(ProgramMapper.toDomain), total };
  }

  async findAllActive(): Promise<Program[]> {
    const rows = await this.prisma.program.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(ProgramMapper.toDomain);
  }

  async findById(id: string): Promise<Program | null> {
    const row = await this.prisma.program.findUnique({ where: { id } });
    return row ? ProgramMapper.toDomain(row) : null;
  }

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.program.findFirst({
      where: { code, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async create(data: CreateProgramData): Promise<Program> {
    const row = await this.prisma.program.create({ data });
    return ProgramMapper.toDomain(row);
  }

  async update(id: string, data: UpdateProgramData): Promise<Program> {
    const row = await this.prisma.program.update({ where: { id }, data });
    return ProgramMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.program.delete({ where: { id } });
  }
}
