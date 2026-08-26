import { Inject, Injectable, Logger } from '@nestjs/common';
import { AwsS3Service } from '@shared/aws/aws-s3.service';
import {
  SponsorPackage,
  SponsorPackageInput,
  SponsorPackageOutput,
} from '@modules/sponsor-package/domain/sponsor-package.entity';
import {
  PackageOutputMode,
  PackageStructure,
} from '@modules/sponsor-package/domain/sponsor-package.enums';
import {
  ISponsorPackageRepository,
  SPONSOR_PACKAGE_REPOSITORY,
} from '@modules/sponsor-package/domain/sponsor-package.repository';
import {
  PackageScopeContext,
  resolveSponsorPackage,
} from '@modules/sponsor-package/domain/resolve-sponsor-package';
import {
  renderTemplate,
  sanitizeSegment,
} from '@modules/sponsor-package/domain/package-templates';
import {
  AttachedInput,
  PackagePlan,
  PlannedOutput,
  SponsorPackagePlanner,
  buildPackageTokens,
} from '@modules/sponsor-package/application/services/sponsor-package-planner.service';
import type {
  ParticipantSponsorInfo,
  ProcesoAbiertoInfo,
} from '../../domain/user-documents.repository';
import {
  DocumentAssembler,
  DocumentToMerge,
  StampPlacement,
  getErrorMessage,
} from './document-assembler.service';

/**
 * Motor configurable de armado de paquetes.
 *
 * Divide el trabajo en dos: `SponsorPackagePlanner` decide **qué** lleva el paquete, y este servicio
 * le pone bytes encima. Esa separación es la que permite que el preview del admin muestre
 * exactamente el mismo árbol que produce la descarga — comparten el planificador.
 */

export type { AttachedInput } from '@modules/sponsor-package/application/services/sponsor-package-planner.service';
export {
  NO_DOCUMENTS_REASON,
  NO_PACKAGE_REASON,
} from '@modules/sponsor-package/application/services/sponsor-package-planner.service';

/** Un archivo listo para escribirse, con su ruta relativa dentro del paquete del participante. */
export interface PackageEntry {
  readonly path: string;
  readonly buffer: Buffer;
}

export interface PackageBuildResult {
  readonly entries: PackageEntry[];
  /** Motivo por el que el participante quedó fuera. null = se armó bien. */
  readonly skipReason: string | null;
}

/**
 * Catálogo de reglas cargado una sola vez por petición.
 *
 * La descarga masiva procesa hasta 100 DNIs; sin esto, resolver el paquete de cada uno sería una
 * consulta por participante para leer siempre las mismas cinco reglas.
 */
export class SponsorPackageCatalog {
  constructor(private readonly bySponsorCode: ReadonlyMap<string, SponsorPackage[]>) {}

  resolve(sponsorCode: string | null, scope: PackageScopeContext): SponsorPackage | null {
    if (!sponsorCode) return null;
    const candidatos = this.bySponsorCode.get(sponsorCode);
    if (!candidatos?.length) return null;
    return resolveSponsorPackage(candidatos, scope);
  }

  /** Todos los insumos que algún paquete del catálogo pide, sin repetir por slug. */
  get inputs(): SponsorPackageInput[] {
    const porSlug = new Map<string, SponsorPackageInput>();
    for (const paquetes of this.bySponsorCode.values()) {
      for (const paquete of paquetes) {
        for (const input of paquete.inputs) {
          if (!porSlug.has(input.slug)) porSlug.set(input.slug, input);
        }
      }
    }
    return [...porSlug.values()];
  }

  get isEmpty(): boolean {
    return this.bySponsorCode.size === 0;
  }
}

@Injectable()
export class SponsorPackageEngine {
  private readonly logger = new Logger(SponsorPackageEngine.name);

  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly sponsorPackageRepo: ISponsorPackageRepository,
    private readonly planner: SponsorPackagePlanner,
    private readonly assembler: DocumentAssembler,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  /** Carga en una sola consulta las reglas de todos los sponsors que aparecen en el lote. */
  async loadCatalog(sponsorCodes: readonly (string | null)[]): Promise<SponsorPackageCatalog> {
    const codes = [...new Set(sponsorCodes.filter((c): c is string => !!c))];
    const paquetes = await this.sponsorPackageRepo.findActiveBySponsorCodes(codes);

    const bySponsorCode = new Map<string, SponsorPackage[]>();
    for (const paquete of paquetes) {
      const lista = bySponsorCode.get(paquete.sponsorCode) ?? [];
      lista.push(paquete);
      bySponsorCode.set(paquete.sponsorCode, lista);
    }
    return new SponsorPackageCatalog(bySponsorCode);
  }

  /**
   * Prefijo de agrupación del ZIP para un participante: `{PROGRAMA}/{PAIS}/{SPONSOR}` por defecto.
   * Solo lo usa la descarga masiva; la individual escribe sin prefijo.
   */
  buildGroupPath(
    paquete: SponsorPackage,
    participant: ParticipantSponsorInfo,
    proceso: ProcesoAbiertoInfo | null,
  ): string {
    return renderTemplate(
      paquete.folderPathTemplate,
      buildPackageTokens(paquete, participant, proceso),
    );
  }

  /** Nombre del archivo suelto o de la carpeta del participante. */
  buildItemName(
    paquete: SponsorPackage,
    participant: ParticipantSponsorInfo,
    proceso: ProcesoAbiertoInfo | null,
  ): string {
    return renderTemplate(
      paquete.itemNameTemplate,
      buildPackageTokens(paquete, participant, proceso),
    );
  }

  /**
   * Sube a S3 los insumos que la configuración marca como archivables. Se llama **una vez por
   * petición**, no por participante: en la descarga masiva un mismo adjunto se reutiliza para todo
   * el lote y no tiene sentido subirlo cien veces.
   */
  async archiveInputs(
    catalog: SponsorPackageCatalog,
    attached: readonly AttachedInput[],
  ): Promise<void> {
    for (const input of catalog.inputs) {
      if (!input.archiveToS3 || !input.s3Folder) continue;

      const archivo = attached.find((a) => a.slug === input.slug);
      if (!archivo) continue;

      await this.awsS3Service.uploadOne(
        {
          buffer: archivo.buffer,
          mimetype: archivo.mimetype,
          originalname: input.archiveFilename ?? archivo.originalname,
        },
        input.s3Folder,
      );
    }
  }

  /**
   * Arma el paquete de un participante. Devuelve las entradas con su ruta **relativa al paquete**:
   * el prefijo de agrupación lo agrega quien llama, porque la descarga individual no lo usa.
   */
  async buildForParticipant(params: {
    userId: string;
    participant: ParticipantSponsorInfo;
    proceso: ProcesoAbiertoInfo | null;
    paquete: SponsorPackage;
    attached: readonly AttachedInput[];
  }): Promise<PackageBuildResult> {
    const plan = await this.planner.plan(params);
    return this.buildFromPlan(plan);
  }

  /** Le pone bytes a un plan ya resuelto. */
  async buildFromPlan(plan: PackagePlan): Promise<PackageBuildResult> {
    if (plan.skipParticipant) return { entries: [], skipReason: plan.skipParticipant };

    const entries: PackageEntry[] = [];

    for (const planned of plan.outputs) {
      if (!planned.emitted) continue;

      const archivo = await this.renderOutput(planned);
      if (!archivo) continue;

      entries.push({
        path: this.buildEntryPath(
          plan.paquete,
          plan.itemName,
          planned.output,
          archivo.extension,
          entries.length,
        ),
        buffer: archivo.buffer,
      });
    }

    // Puede pasar que el plan emitiera archivos pero todos fallaran al bajarse de S3.
    if (!entries.length) {
      return { entries: [], skipReason: 'El participante no tiene documentos subidos para combinar.' };
    }
    return { entries, skipReason: null };
  }

  private async renderOutput(
    planned: PlannedOutput,
  ): Promise<{ buffer: Buffer; extension: string } | null> {
    const documents: DocumentToMerge[] = planned.resueltas.map((s) => ({
      key: s.key!,
      ...(s.url ? { url: s.url } : {}),
      ...(s.bytes ? { bytes: s.bytes } : {}),
    }));

    if (planned.output.mode === PackageOutputMode.ARCHIVO_ORIGINAL) {
      if (!documents.length) return null;
      return this.assembler.buildRawFile(documents[0]);
    }

    const stamps = await this.loadStamps(planned.output);
    const { buffer } = await this.assembler.buildMergedPdf(documents, stamps);
    return { buffer, extension: 'pdf' };
  }

  /** Baja las imágenes de los sellos. Un sello que no se puede bajar no tumba el archivo: sale sin él. */
  private async loadStamps(output: SponsorPackageOutput): Promise<StampPlacement[]> {
    const placements: StampPlacement[] = [];

    for (const stamp of output.stamps) {
      try {
        const imageBytes = await this.assembler.downloadStampAsset(stamp.assetUrl);
        if (!imageBytes) continue;

        placements.push({
          imageBytes,
          onlyKey: stamp.onlyDocumentId,
          widthPt: stamp.widthPt,
          marginXPt: stamp.marginXPt,
          marginYPt: stamp.marginYPt,
          anchor: stamp.anchor,
        });
      } catch (error) {
        this.logger.warn(`Sello ${stamp.id} omitido: ${getErrorMessage(error)}`);
      }
    }

    return placements;
  }

  /**
   * En `CARPETA_POR_PARTICIPANTE` cada archivo va dentro de la carpeta del participante.
   *
   * En `ARCHIVO_SUELTO` el archivo toma el nombre del participante y el `filename` del output se
   * ignora — es el caso ASPIRE, un PDF por persona. Si un paquete suelto llegara a emitir más de un
   * archivo, el segundo y siguientes llevan el `filename` como sufijo: es configuración rara, pero
   * es preferible a que se pisen entre ellos en silencio.
   */
  private buildEntryPath(
    paquete: SponsorPackage,
    itemName: string,
    output: SponsorPackageOutput,
    extension: string,
    yaEmitidos: number,
  ): string {
    if (paquete.structure === PackageStructure.ARCHIVO_SUELTO) {
      const sufijo = yaEmitidos === 0 ? '' : ` - ${sanitizeSegment(output.filename)}`;
      return `${itemName}${sufijo}.${extension}`;
    }
    return `${itemName}/${sanitizeSegment(output.filename)}.${extension}`;
  }
}
