import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IEtiquetaRepository,
  EtiquetaFilters,
  CreateEtiquetaData,
  UpdateEtiquetaData,
} from '../../domain/etiqueta.repository';
import { Etiqueta } from '../../domain/etiqueta.entity';
import { EtiquetaMapper, ETIQUETA_FULL_INCLUDE } from './etiqueta.mapper';

@Injectable()
export class EtiquetaPrismaRepository implements IEtiquetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, search }: EtiquetaFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && { name: { contains: search } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.etiquetas.findMany({
        where,
        include: ETIQUETA_FULL_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.etiquetas.count({ where }),
    ]);

    return { data: data.map(EtiquetaMapper.toDomain), total };
  }

  async findAllActive(): Promise<Etiqueta[]> {
    const rows = await this.prisma.etiquetas.findMany({
      where: { status: true },
      include: ETIQUETA_FULL_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(EtiquetaMapper.toDomain);
  }

  async findById(id: string): Promise<Etiqueta | null> {
    const row = await this.prisma.etiquetas.findUnique({
      where: { id },
      include: ETIQUETA_FULL_INCLUDE,
    });
    return row ? EtiquetaMapper.toDomain(row) : null;
  }

  async create(data: CreateEtiquetaData): Promise<Etiqueta> {
    const row = await this.prisma.etiquetas.create({
      data,
      include: ETIQUETA_FULL_INCLUDE,
    });
    return EtiquetaMapper.toDomain(row);
  }

  async update(id: string, data: UpdateEtiquetaData): Promise<Etiqueta> {
    const row = await this.prisma.etiquetas.update({
      where: { id },
      data,
      include: ETIQUETA_FULL_INCLUDE,
    });
    return EtiquetaMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.etiquetas.delete({ where: { id } });
  }
}
