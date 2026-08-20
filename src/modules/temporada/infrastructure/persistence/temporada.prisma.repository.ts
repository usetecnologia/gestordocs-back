import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  ITemporadaRepository,
  TemporadaFilters,
  CreateTemporadaData,
  UpdateTemporadaData,
} from '../../domain/temporada.repository';
import { Temporada } from '../../domain/temporada.entity';
import { TemporadaMapper, TEMPORADA_INCLUDE } from './temporada.mapper';

@Injectable()
export class TemporadaPrismaRepository implements ITemporadaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, programId, status, search }: TemporadaFilters) {
    const where = {
      programId,
      ...(status !== undefined && { status }),
      ...(search && { name: { contains: search } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.temporada.findMany({
        where,
        include: TEMPORADA_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createAt: 'desc' },
      }),
      this.prisma.temporada.count({ where }),
    ]);

    return { data: data.map(TemporadaMapper.toDomain), total };
  }

  async findActiveByProgramIds(programIds: string[]): Promise<Temporada[]> {
    const rows = await this.prisma.temporada.findMany({
      where: { status: true, programId: { in: programIds } },
      include: TEMPORADA_INCLUDE,
      orderBy: [{ programId: 'asc' }, { name: 'asc' }],
    });
    return rows.map(TemporadaMapper.toDomain);
  }

  async findById(id: string): Promise<Temporada | null> {
    const row = await this.prisma.temporada.findUnique({
      where: { id },
      include: TEMPORADA_INCLUDE,
    });
    return row ? TemporadaMapper.toDomain(row) : null;
  }

  async isNameTaken(name: string, programId: string, excludeId?: string): Promise<boolean> {
    // La colación de la BD (utf8mb4_unicode_ci) hace la comparación insensible a mayúsculas.
    const row = await this.prisma.temporada.findFirst({
      where: {
        name: name.trim(),
        programId,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    return !!row;
  }

  async countDocumentProgramsUsing(id: string): Promise<number> {
    return this.prisma.documentProgram.count({ where: { temporadaId: id } });
  }

  async create(data: CreateTemporadaData): Promise<Temporada> {
    const row = await this.prisma.temporada.create({
      data,
      include: TEMPORADA_INCLUDE,
    });
    return TemporadaMapper.toDomain(row);
  }

  async update(id: string, data: UpdateTemporadaData): Promise<Temporada> {
    const row = await this.prisma.temporada.update({
      where: { id },
      data,
      include: TEMPORADA_INCLUDE,
    });
    return TemporadaMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.temporada.delete({ where: { id } });
  }
}
