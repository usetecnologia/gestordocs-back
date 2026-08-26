import { Injectable } from '@nestjs/common';
import { Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import {
  CreateSponsorPackageData,
  ISponsorPackageRepository,
  ReferenceCheck,
  ReferenceCheckResult,
  SponsorPackageFilters,
  SponsorPackageListItem,
  UpdateSponsorPackageData,
  UpsertInputData,
  UpsertOutputData,
} from '../../domain/sponsor-package.repository';
import { SponsorPackage } from '../../domain/sponsor-package.entity';
import { PackageStructure } from '../../domain/sponsor-package.enums';
import { SPONSOR_PACKAGE_FULL_INCLUDE, SponsorPackageMapper } from './sponsor-package.mapper';

const LIST_INCLUDE = {
  sponsor: { select: { id: true, code: true, name: true } },
  program: { select: { id: true, name: true } },
  country: { select: { id: true, name: true } },
  _count: { select: { outputs: true, inputs: true } },
} satisfies Prisma.SponsorPackageInclude;

@Injectable()
export class SponsorPackagePrismaRepository implements ISponsorPackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  findActiveBySponsorCode(sponsorCode: string): Promise<SponsorPackage[]> {
    return this.findActiveBySponsorCodes([sponsorCode]);
  }

  async findActiveBySponsorCodes(sponsorCodes: readonly string[]): Promise<SponsorPackage[]> {
    if (!sponsorCodes.length) return [];

    const rows = await this.prisma.sponsorPackage.findMany({
      where: { status: true, sponsor: { code: { in: [...new Set(sponsorCodes)] } } },
      include: SPONSOR_PACKAGE_FULL_INCLUDE,
      // El desempate real lo hace `resolveSponsorPackage`. Este orden solo hace la consulta
      // determinista, para que dos corridas devuelvan las filas en la misma secuencia.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => SponsorPackageMapper.toDomain(row));
  }

  async findAll({
    page,
    limit,
    search,
    sponsorId,
    programId,
    countryId,
    status,
    structure,
  }: SponsorPackageFilters): Promise<{ data: SponsorPackageListItem[]; total: number }> {
    const where: Prisma.SponsorPackageWhereInput = {
      ...(sponsorId && { sponsorId }),
      ...(programId && { programId }),
      ...(countryId && { countryId }),
      ...(status !== undefined && { status }),
      ...(structure && { structure }),
      ...(search && {
        OR: [
          { name: { contains: search } },
          { sponsor: { code: { contains: search } } },
          { sponsor: { name: { contains: search } } },
        ],
      }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sponsorPackage.findMany({
        where,
        include: LIST_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ sponsor: { code: 'asc' } }, { priority: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.sponsorPackage.count({ where }),
    ]);

    return {
      total,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        sponsorId: row.sponsorId,
        sponsorCode: row.sponsor.code,
        sponsorName: row.sponsor.name,
        programId: row.programId,
        programName: row.program?.name ?? null,
        countryId: row.countryId,
        countryName: row.country?.name ?? null,
        structure: row.structure as unknown as PackageStructure,
        outputCount: row._count.outputs,
        inputCount: row._count.inputs,
        priority: row.priority,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async findById(id: string): Promise<SponsorPackage | null> {
    const row = await this.prisma.sponsorPackage.findUnique({
      where: { id },
      include: SPONSOR_PACKAGE_FULL_INCLUDE,
    });
    return row ? SponsorPackageMapper.toDomain(row) : null;
  }

  async findScopeConflict(
    sponsorId: string,
    programId: string | null,
    countryId: string | null,
    excludeId?: string,
  ): Promise<{ id: string; name: string } | null> {
    // `programId: null` en Prisma se traduce a `IS NULL`, que es exactamente lo que hace falta:
    // dos genéricos del mismo sponsor tienen que colisionar, y el índice único no los detecta.
    return this.prisma.sponsorPackage.findFirst({
      where: {
        sponsorId,
        programId,
        countryId,
        status: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true, name: true },
    });
  }

  async checkReferences({
    sponsorId,
    programId,
    countryId,
    documentIds,
  }: ReferenceCheck): Promise<ReferenceCheckResult> {
    const [sponsor, program, country, documentos] = await this.prisma.$transaction([
      this.prisma.sponsor.count({ where: { id: sponsorId } }),
      this.prisma.program.count({ where: programId ? { id: programId } : { id: '' } }),
      this.prisma.country.count({ where: countryId ? { id: countryId } : { id: '' } }),
      this.prisma.documents.findMany({
        where: { id: { in: documentIds }, status: true },
        select: { id: true },
      }),
    ]);

    const encontrados = new Set(documentos.map((d) => d.id));

    return {
      sponsorExists: sponsor > 0,
      // Un alcance en null es válido (significa "todos"), así que no hay nada que verificar.
      programExists: programId === null || program > 0,
      countryExists: countryId === null || country > 0,
      missingDocumentIds: documentIds.filter((id) => !encontrados.has(id)),
    };
  }

  // ---------------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------------

  async create(data: CreateSponsorPackageData): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const paquete = await tx.sponsorPackage.create({
        data: {
          name: data.name,
          sponsorId: data.sponsorId,
          programId: data.programId,
          countryId: data.countryId,
          structure: data.structure,
          folderPathTemplate: data.folderPathTemplate,
          itemNameTemplate: data.itemNameTemplate,
          fallbackPrograma: data.fallbackPrograma,
          fallbackPais: data.fallbackPais,
          priority: data.priority,
          createdById: data.createdById,
          updatedById: data.createdById,
        },
        select: { id: true },
      });

      await this.writeTree(tx, paquete.id, data.outputs, data.inputs);
      return paquete.id;
    });
  }

  async update(id: string, data: UpdateSponsorPackageData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sponsorPackage.update({
        where: { id },
        data: {
          name: data.name,
          sponsorId: data.sponsorId,
          programId: data.programId,
          countryId: data.countryId,
          structure: data.structure,
          folderPathTemplate: data.folderPathTemplate,
          itemNameTemplate: data.itemNameTemplate,
          fallbackPrograma: data.fallbackPrograma,
          fallbackPais: data.fallbackPais,
          priority: data.priority,
          status: data.status,
          updatedById: data.updatedById,
        },
      });

      // Replace-all, igual que el update de documentos: se borra el árbol y se recrea. Los hijos
      // de outputs (fuentes y sellos) caen por CASCADE, así que alcanza con borrar los dos niveles
      // de arriba. Va dentro de la transacción: un fallo a mitad no puede dejar el paquete sin
      // archivos.
      await tx.sponsorPackageOutput.deleteMany({ where: { packageId: id } });
      await tx.sponsorPackageInput.deleteMany({ where: { packageId: id } });

      await this.writeTree(tx, id, data.outputs, data.inputs);
    });
  }

  async softDelete(id: string, updatedById: string | null): Promise<void> {
    await this.prisma.sponsorPackage.update({
      where: { id },
      data: { status: false, updatedById },
    });
  }

  async updateOutputsOrder(
    id: string,
    orders: readonly { outputId: string; order: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      orders.map(({ outputId, order }) =>
        this.prisma.sponsorPackageOutput.update({
          where: { id: outputId, packageId: id },
          data: { order },
        }),
      ),
    );
  }

  /**
   * Escribe outputs e inputs de un paquete recién vaciado.
   *
   * Los insumos van **primero**: las fuentes los referencian por slug y necesitan su id, que recién
   * existe una vez creados.
   */
  private async writeTree(
    tx: Prisma.TransactionClient,
    packageId: string,
    outputs: readonly UpsertOutputData[],
    inputs: readonly UpsertInputData[],
  ): Promise<void> {
    const inputIdBySlug = new Map<string, string>();

    for (const input of inputs) {
      const creado = await tx.sponsorPackageInput.create({
        data: {
          packageId,
          slug: input.slug,
          label: input.label,
          required: input.required,
          mimeType: input.mimeType,
          maxSizeMb: input.maxSizeMb,
          archiveToS3: input.archiveToS3,
          s3Folder: input.s3Folder ?? null,
          archiveFilename: input.archiveFilename ?? null,
        },
        select: { id: true },
      });
      inputIdBySlug.set(input.slug, creado.id);
    }

    for (const output of outputs) {
      const creado = await tx.sponsorPackageOutput.create({
        data: {
          packageId,
          filename: output.filename,
          mode: output.mode,
          order: output.order,
          emitWhenEmpty: output.emitWhenEmpty,
        },
        select: { id: true },
      });

      for (const source of output.sources) {
        await tx.sponsorPackageOutputSource.create({
          data: {
            outputId: creado.id,
            documentId: source.documentId ?? null,
            inputId: source.inputSlug ? (inputIdBySlug.get(source.inputSlug) ?? null) : null,
            order: source.order,
            onMissing: source.onMissing,
          },
        });
      }

      for (const stamp of output.stamps) {
        await tx.sponsorPackageOutputStamp.create({
          data: {
            outputId: creado.id,
            assetUrl: stamp.assetUrl,
            onlyDocumentId: stamp.onlyDocumentId ?? null,
            widthPt: stamp.widthPt,
            marginXPt: stamp.marginXPt,
            marginYPt: stamp.marginYPt,
            anchor: stamp.anchor,
          },
        });
      }
    }
  }
}
