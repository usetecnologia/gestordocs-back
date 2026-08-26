import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SponsorPackage } from '../../domain/sponsor-package.entity';
import {
  CreateSponsorPackageData,
  ISponsorPackageRepository,
  SPONSOR_PACKAGE_REPOSITORY,
  SponsorPackageFilters,
  SponsorPackageListItem,
  UpdateSponsorPackageData,
  UpsertOutputData,
} from '../../domain/sponsor-package.repository';
import { assertPackageIsValid } from '../validators/sponsor-package.validator';

/**
 * CRUD de los paquetes de descarga. Van juntos en un archivo porque son cinco operaciones cortas
 * sobre el mismo agregado y separarlas en cinco archivos de veinte líneas no aclara nada.
 *
 * Todos validan con `assertPackageIsValid`: crear, actualizar y duplicar no pueden divergir en qué
 * consideran una regla válida.
 */

@Injectable()
export class FindAllSponsorPackagesUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  execute(filters: SponsorPackageFilters): Promise<{ data: SponsorPackageListItem[]; total: number }> {
    return this.repo.findAll(filters);
  }
}

@Injectable()
export class FindOneSponsorPackageUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(id: string): Promise<SponsorPackage> {
    const paquete = await this.repo.findById(id);
    if (!paquete) throw new NotFoundException(`Paquete #${id} no encontrado.`);
    return paquete;
  }
}

@Injectable()
export class CreateSponsorPackageUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(data: CreateSponsorPackageData): Promise<SponsorPackage> {
    await assertPackageIsValid(this.repo, data);
    const id = await this.repo.create(data);
    return (await this.repo.findById(id))!;
  }
}

@Injectable()
export class UpdateSponsorPackageUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(id: string, data: UpdateSponsorPackageData): Promise<SponsorPackage> {
    const existente = await this.repo.findById(id);
    if (!existente) throw new NotFoundException(`Paquete #${id} no encontrado.`);

    // Se excluye a sí mismo del chequeo de alcance: si no, guardar sin tocar el alcance chocaría
    // consigo mismo.
    await assertPackageIsValid(this.repo, data, id);
    await this.repo.update(id, data);
    return (await this.repo.findById(id))!;
  }
}

@Injectable()
export class DeleteSponsorPackageUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(id: string, updatedById: string | null): Promise<void> {
    const existente = await this.repo.findById(id);
    if (!existente) throw new NotFoundException(`Paquete #${id} no encontrado.`);
    await this.repo.softDelete(id, updatedById);
  }
}

@Injectable()
export class DuplicateSponsorPackageUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  /**
   * Clona el árbol completo. Es la forma natural de derivar "UNITED para Intern" del UNITED
   * genérico: se duplica, se le pone alcance y se ajusta.
   *
   * La copia nace **desactivada**. Si naciera activa chocaría de inmediato contra el original por
   * unicidad de alcance, y obligaría a elegir el alcance antes de poder siquiera guardar.
   */
  async execute(id: string, name: string, createdById: string | null): Promise<SponsorPackage> {
    const original = await this.repo.findById(id);
    if (!original) throw new NotFoundException(`Paquete #${id} no encontrado.`);

    const nuevoId = await this.repo.create({
      name,
      sponsorId: original.sponsorId,
      programId: original.programId,
      countryId: original.countryId,
      structure: original.structure,
      folderPathTemplate: original.folderPathTemplate,
      itemNameTemplate: original.itemNameTemplate,
      fallbackPrograma: original.fallbackPrograma,
      fallbackPais: original.fallbackPais,
      priority: original.priority,
      inputs: original.inputs.map((input) => ({
        slug: input.slug,
        label: input.label,
        required: input.required,
        mimeType: input.mimeType,
        maxSizeMb: input.maxSizeMb,
        archiveToS3: input.archiveToS3,
        s3Folder: input.s3Folder,
        archiveFilename: input.archiveFilename,
      })),
      outputs: original.outputs.map(
        (output): UpsertOutputData => ({
          filename: output.filename,
          mode: output.mode,
          order: output.order,
          emitWhenEmpty: output.emitWhenEmpty,
          // Las fuentes referencian el insumo por slug, no por id: los del original no sirven
          // para el clon, que crea los suyos.
          sources: output.sources.map((source) => ({
            documentId: source.documentId,
            inputSlug: source.inputSlug,
            order: source.order,
            onMissing: source.onMissing,
          })),
          stamps: output.stamps.map((stamp) => ({
            assetUrl: stamp.assetUrl,
            onlyDocumentId: stamp.onlyDocumentId,
            widthPt: stamp.widthPt,
            marginXPt: stamp.marginXPt,
            marginYPt: stamp.marginYPt,
            anchor: stamp.anchor,
          })),
        }),
      ),
      createdById,
    });

    await this.repo.softDelete(nuevoId, createdById);
    return (await this.repo.findById(nuevoId))!;
  }
}

@Injectable()
export class UpdateSponsorPackageOutputsOrderUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(id: string, orders: readonly { outputId: string; order: number }[]): Promise<void> {
    const paquete = await this.repo.findById(id);
    if (!paquete) throw new NotFoundException(`Paquete #${id} no encontrado.`);

    const propios = new Set(paquete.outputs.map((o) => o.id));
    const ajenos = orders.filter((o) => !propios.has(o.outputId));
    if (ajenos.length) {
      throw new NotFoundException(
        `Estos archivos no pertenecen al paquete: ${ajenos.map((a) => a.outputId).join(', ')}`,
      );
    }

    await this.repo.updateOutputsOrder(id, orders);
  }
}
