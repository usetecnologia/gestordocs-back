import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IRoleRepository,
  RoleFilters,
  CreateRoleData,
  UpdateRoleData,
} from '../../domain/role.repository';
import { Role } from '../../domain/role.entity';
import { RoleMapper } from './role.mapper';

@Injectable()
export class RolePrismaRepository implements IRoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, search }: RoleFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(search && {
        OR: [{ name: { contains: search } }, { code: { contains: search } }],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.role.count({ where }),
    ]);

    return { data: data.map(RoleMapper.toDomain), total };
  }

  async findAllActive(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      where: { status: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(RoleMapper.toDomain);
  }

  async findById(id: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({ where: { id } });
    return row ? RoleMapper.toDomain(row) : null;
  }

  async isCodeTaken(code: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.role.findFirst({
      where: { code, ...(excludeId && { id: { not: excludeId } }) },
    });
    return !!row;
  }

  async create(data: CreateRoleData): Promise<Role> {
    const row = await this.prisma.role.create({ data });
    return RoleMapper.toDomain(row);
  }

  async update(id: string, data: UpdateRoleData): Promise<Role> {
    const row = await this.prisma.role.update({ where: { id }, data });
    return RoleMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }
}
