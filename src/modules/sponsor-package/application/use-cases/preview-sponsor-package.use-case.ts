import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '@modules/user-documents/domain/user-documents.repository';
import {
  ISponsorPackageRepository,
  SPONSOR_PACKAGE_REPOSITORY,
} from '../../domain/sponsor-package.repository';
import { resolveSponsorPackage } from '../../domain/resolve-sponsor-package';
import { PackageStructure } from '../../domain/sponsor-package.enums';
import { sanitizeSegment } from '../../domain/package-templates';
import {
  NO_PACKAGE_REASON,
  PlannedOutput,
  SourceOutcome,
  SponsorPackagePlanner,
} from '../services/sponsor-package-planner.service';

/**
 * "Probar con un DNI": muestra el árbol que la descarga produciría, con los faltantes y su motivo,
 * **sin generar el ZIP**.
 *
 * Es la red que hace que editar estas reglas en producción no sea una apuesta. Usa el mismo
 * `SponsorPackagePlanner` que el motor de armado — si resolviera por su cuenta, mostraría un árbol
 * que no es el real, y un preview que miente es peor que no tener preview.
 *
 * No baja un solo byte de S3: el plan sabe qué documentos entran sin necesidad de leerlos.
 */

const MOTIVO_POR_OUTCOME: Record<SourceOutcome, string> = {
  [SourceOutcome.OK]: 'Incluido.',
  [SourceOutcome.NO_APLICA]: 'No le corresponde a su programa o país.',
  [SourceOutcome.SIN_ARCHIVO]: 'Le corresponde pero no lo tiene subido.',
  [SourceOutcome.NO_ADJUNTADO]: 'Es un archivo que se adjunta al momento de descargar.',
  [SourceOutcome.CONFIG_INVALIDA]: 'La regla está mal configurada: no apunta a nada.',
};

export interface PreviewSourceResult {
  label: string;
  incluido: boolean;
  motivo: string;
}

export interface PreviewFileResult {
  /** Ruta tal como quedaría dentro del ZIP, ya con la carpeta de agrupación. */
  path: string;
  emitido: boolean;
  motivo: string | null;
  sources: PreviewSourceResult[];
}

export interface PreviewResult {
  paquete: { id: string; name: string; sponsorCode: string; structure: PackageStructure };
  participante: {
    dni: string;
    nombreCompleto: string;
    sponsorCode: string | null;
    programa: string | null;
    pais: string | null;
    tieneProcesoAbierto: boolean;
  };
  groupPath: string;
  itemName: string;
  archivos: PreviewFileResult[];
  /** Motivo por el que el participante entero quedaría fuera. null = se arma. */
  skipParticipant: string | null;
  /** Insumos que habría que adjuntar para que la descarga real funcione. */
  adjuntosRequeridos: string[];
}

@Injectable()
export class PreviewSponsorPackageUseCase {
  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly sponsorPackageRepo: ISponsorPackageRepository,
    private readonly planner: SponsorPackagePlanner,
  ) {}

  /**
   * `packageId` fuerza a probar un paquete concreto — es lo que quiere el admin que está editando
   * uno. Sin él se resuelve por el sponsor del participante, que es lo que haría la descarga real.
   */
  async execute(dni: string, packageId?: string): Promise<PreviewResult> {
    const participant = await this.userDocumentsRepo.findParticipantInfoByDni(dni);
    if (!participant) throw new NotFoundException(`No hay ningún participante con el DNI ${dni}.`);

    const proceso = await this.userDocumentsRepo.findProcesoAbiertoByUserId(participant.id);

    const paquete = packageId
      ? await this.sponsorPackageRepo.findById(packageId)
      : resolveSponsorPackage(
          await this.sponsorPackageRepo.findActiveBySponsorCode(participant.sponsorCode ?? ''),
          { programId: proceso?.programId ?? null, countryId: proceso?.countryId ?? null },
        );

    if (!paquete) {
      throw new NotFoundException(
        packageId ? `Paquete #${packageId} no encontrado.` : NO_PACKAGE_REASON,
      );
    }

    // El preview no recibe adjuntos: los insumos aparecen como "hay que adjuntarlo", que es
    // información útil, no un error.
    const plan = await this.planner.plan({
      userId: participant.id,
      participant,
      proceso,
      paquete,
      attached: [],
    });

    const apellidos = [participant.lastfathername, participant.lastmothername]
      .filter(Boolean)
      .join(' ');
    const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');

    return {
      paquete: {
        id: paquete.id,
        name: paquete.name,
        sponsorCode: paquete.sponsorCode,
        structure: paquete.structure,
      },
      participante: {
        dni: participant.dni ?? '',
        nombreCompleto: `${apellidos}, ${nombres}`,
        sponsorCode: participant.sponsorCode,
        programa: proceso?.programName ?? null,
        pais: proceso?.countryName ?? null,
        tieneProcesoAbierto: !!proceso,
      },
      groupPath: plan.groupPath,
      itemName: plan.itemName,
      archivos: plan.outputs.map((planned) => this.toFile(plan.groupPath, plan.itemName, paquete.structure, planned)),
      skipParticipant: plan.skipParticipant,
      adjuntosRequeridos: paquete.inputs.filter((i) => i.required).map((i) => i.label),
    };
  }

  private toFile(
    groupPath: string,
    itemName: string,
    structure: PackageStructure,
    planned: PlannedOutput,
  ): PreviewFileResult {
    // En formato original la extensión real se detecta por los bytes del archivo, así que sin
    // bajarlo no se puede saber. Se muestra como tal en vez de inventar una.
    const extension = SponsorPackagePlanner.extensionFor(planned.output) ?? 'formato original';

    const nombre =
      structure === PackageStructure.ARCHIVO_SUELTO
        ? `${itemName}.${extension}`
        : `${itemName}/${sanitizeSegment(planned.output.filename)}.${extension}`;

    return {
      path: `${groupPath}/${nombre}`,
      emitido: planned.emitted,
      motivo: planned.skipReason,
      sources: planned.sources.map((source) => ({
        label: source.label,
        incluido: source.outcome === SourceOutcome.OK,
        motivo: MOTIVO_POR_OUTCOME[source.outcome],
      })),
    };
  }
}
