import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  IOptionProgramRepository,
  OptionProgramFilters,
  CreateOptionProgramData,
  UpdateOptionProgramData,
} from '../../domain/option-program.repository';
import { OptionProgram } from '../../domain/option-program.entity';
import { OptionProgramMapper, OPTION_PROGRAM_INCLUDE } from './option-program.mapper';

@Injectable()
export class OptionProgramPrismaRepository implements IOptionProgramRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll({ page, limit, status, programId, search }: OptionProgramFilters) {
    const where = {
      ...(status !== undefined && { status }),
      ...(programId && { programId }),
      ...(search && { shortDatabase: { contains: search } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.optionProgram.findMany({
        where,
        include: OPTION_PROGRAM_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createAt: 'desc' },
      }),
      this.prisma.optionProgram.count({ where }),
    ]);

    return { data: data.map(OptionProgramMapper.toDomain), total };
  }

  async findAllForSync() {
    return this.prisma.optionProgram.findMany({
      select: { id: true, programId: true, shortDatabase: true },
    });
  }

  async findById(id: string): Promise<OptionProgram | null> {
    const row = await this.prisma.optionProgram.findUnique({
      where: { id },
      include: OPTION_PROGRAM_INCLUDE,
    });
    return row ? OptionProgramMapper.toDomain(row) : null;
  }

  async create(data: CreateOptionProgramData): Promise<OptionProgram> {
    const row = await this.prisma.optionProgram.create({
      data,
      include: OPTION_PROGRAM_INCLUDE,
    });
    return OptionProgramMapper.toDomain(row);
  }

  async update(id: string, data: UpdateOptionProgramData): Promise<OptionProgram> {
    const row = await this.prisma.optionProgram.update({
      where: { id },
      data,
      include: OPTION_PROGRAM_INCLUDE,
    });
    return OptionProgramMapper.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.optionProgram.delete({ where: { id } });
  }
}
