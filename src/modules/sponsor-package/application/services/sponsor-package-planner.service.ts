import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  ProcesoAbiertoInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '@modules/user-documents/domain/user-documents.repository';
import {
  SponsorPackage,
  SponsorPackageOutput,
  SponsorPackageSource,
} from '../../domain/sponsor-package.entity';
import { PackageOnMissing, PackageOutputMode } from '../../domain/sponsor-package.enums';
import {
  TemplateTokens,
  renderTemplate,
  sanitizeSegment,
} from '../../domain/package-templates';

/**
 * Decide **qué** va a llevar el paquete de un participante, sin bajar ni combinar un solo archivo.
 *
 * Lo comparten el motor de armado y el preview del admin, y eso es deliberado: si el preview
 * resolviera por su cuenta, mostraría un árbol que no es el que la descarga produce, y un preview
 * que miente es peor que no tener preview. Acá se resuelve una vez; el motor le pone bytes encima y
 * el preview lo dibuja.
 */

/** Por qué una fuente no aportó archivo. */
export enum SourceOutcome {
  OK = 'OK',
  /** El documento no le corresponde a su programa o país. */
  NO_APLICA = 'NO_APLICA',
  /** Le corresponde, pero no lo subió (o su última entrada no tiene URL). */
  SIN_ARCHIVO = 'SIN_ARCHIVO',
  /** Es un insumo y no se adjuntó en la petición. */
  NO_ADJUNTADO = 'NO_ADJUNTADO',
  /** La fuente no apunta ni a documento ni a insumo. Configuración inválida. */
  CONFIG_INVALIDA = 'CONFIG_INVALIDA',
}

/** Una fuente ya resuelta: de dónde salen sus bytes, o por qué no salieron. */
export interface PlannedSource {
  readonly sourceId: string;
  /** Cómo se le muestra al admin: la sigla del documento o `adjunto:slug`. */
  readonly label: string;
  readonly outcome: SourceOutcome;
  /** Clave con la que el ensamblador identifica esta fuente. Presente solo si `outcome` es OK. */
  readonly key: string | null;
  readonly url: string | null;
  readonly bytes: Buffer | null;
}

export interface PlannedOutput {
  readonly output: SponsorPackageOutput;
  readonly sources: readonly PlannedSource[];
  /** Las fuentes que sí aportan, en orden. Vacío si el archivo sale por `emitWhenEmpty`. */
  readonly resueltas: readonly PlannedSource[];
  readonly emitted: boolean;
  /** Por qué no se emite. null si se emite. */
  readonly skipReason: string | null;
}

export interface PackagePlan {
  readonly paquete: SponsorPackage;
  readonly itemName: string;
  readonly groupPath: string;
  readonly outputs: readonly PlannedOutput[];
  /** Motivo por el que el participante entero queda fuera. null = se arma. */
  readonly skipParticipant: string | null;
}

/** Un archivo que el staff adjuntó en la petición. */
export interface AttachedInput {
  readonly slug: string;
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
}

export const NO_PACKAGE_REASON =
  'El sponsor del participante no tiene un paquete de descarga configurado.';
export const NO_DOCUMENTS_REASON = 'El participante no tiene documentos subidos para combinar.';

const SIN_FUENTES_REASON = 'Ninguna de sus fuentes tiene archivo.';

function labelOf(source: SponsorPackageSource): string {
  if (source.inputSlug) return `adjunto:${source.inputSlug}`;
  return source.documentSiglasCode ?? source.documentName ?? source.documentId ?? 'sin nombre';
}

/** Motivo cuando una fuente obligatoria falta y la regla dice omitir al participante. */
export function missingSourceReason(source: SponsorPackageSource): string {
  return `Falta el documento requerido "${labelOf(source)}" para armar el paquete.`;
}

/**
 * Valores de los tokens de plantilla para un participante. Función pura: la usan el planificador,
 * el motor (para la carpeta de agrupación) y el preview, sin tocar base de datos.
 *
 * Programa y país salen del **proceso**, no del `User`: son los del ciclo que se está descargando.
 */
export function buildPackageTokens(
  paquete: Pick<SponsorPackage, 'sponsorCode' | 'fallbackPrograma' | 'fallbackPais'>,
  participant: ParticipantSponsorInfo,
  proceso: Pick<ProcesoAbiertoInfo, 'programName' | 'countryName'> | null,
): TemplateTokens {
  const apellidos = [participant.lastfathername, participant.lastmothername]
    .filter(Boolean)
    .join(' ');
  const nombres = [participant.firstname, participant.middlename].filter(Boolean).join(' ');

  return {
    dni: participant.dni ?? participant.id,
    apellidos,
    nombres,
    nombreCompleto: `${apellidos}, ${nombres}`,
    sponsor: paquete.sponsorCode,
    programa: sanitizeSegment(proceso?.programName, paquete.fallbackPrograma),
    pais: sanitizeSegment(proceso?.countryName, paquete.fallbackPais),
  };
}

@Injectable()
export class SponsorPackagePlanner {
  private readonly logger = new Logger(SponsorPackagePlanner.name);

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
  ) {}

  async plan(params: {
    userId: string;
    participant: ParticipantSponsorInfo;
    proceso: ProcesoAbiertoInfo | null;
    paquete: SponsorPackage;
    attached: readonly AttachedInput[];
  }): Promise<PackagePlan> {
    const { userId, participant, proceso, paquete, attached } = params;

    const context = await this.userDocumentsRepo.findUserApplicabilityContext(userId);
    const applicability = {
      // El sponsor lo fija el paquete, no el participante: es el mismo criterio que usaba
      // `collectDocuments`, donde ASPIRE y AAG pasaban su propio código.
      sponsorCode: paquete.sponsorCode,
      programId: context?.programId ?? null,
      countryId: context?.countryId ?? null,
    };

    const tokens = buildPackageTokens(paquete, participant, proceso);
    const itemName = renderTemplate(paquete.itemNameTemplate, tokens);
    const groupPath = renderTemplate(paquete.folderPathTemplate, tokens);

    const outputs: PlannedOutput[] = [];
    let skipParticipant: string | null = null;

    for (const output of paquete.outputs) {
      const sources: PlannedSource[] = [];
      let skipOutput: string | null = null;

      for (const source of output.sources) {
        const planned = await this.planSource(userId, source, applicability, attached);
        sources.push(planned);

        if (planned.outcome === SourceOutcome.OK) continue;

        if (source.onMissing === PackageOnMissing.OMITIR_PARTICIPANTE && !skipParticipant) {
          skipParticipant = missingSourceReason(source);
        }
        if (source.onMissing === PackageOnMissing.OMITIR_ARCHIVO && !skipOutput) {
          skipOutput = `Falta "${labelOf(source)}", que la regla marca como obligatorio para este archivo.`;
        }
        // OMITIR_FUENTE: se cae la fuente y el archivo se arma con el resto.
      }

      const resueltas = sources.filter((s) => s.outcome === SourceOutcome.OK);
      const emitted = !skipOutput && (resueltas.length > 0 || output.emitWhenEmpty);

      outputs.push({
        output,
        sources,
        resueltas,
        emitted,
        skipReason: emitted ? null : (skipOutput ?? SIN_FUENTES_REASON),
      });
    }

    // Si alguna regla dijo "omitir participante", eso gana sobre cualquier archivo que sí se armó.
    if (!skipParticipant && !outputs.some((o) => o.emitted)) {
      skipParticipant = NO_DOCUMENTS_REASON;
    }

    return { paquete, itemName, groupPath, outputs, skipParticipant };
  }

  private async planSource(
    userId: string,
    source: SponsorPackageSource,
    applicability: { sponsorCode: string; programId: string | null; countryId: string | null },
    attached: readonly AttachedInput[],
  ): Promise<PlannedSource> {
    const base = { sourceId: source.id, label: labelOf(source), key: null, url: null, bytes: null };

    if (source.inputId) {
      const archivo = attached.find((a) => a.slug === source.inputSlug);
      if (!archivo) return { ...base, outcome: SourceOutcome.NO_ADJUNTADO };
      return {
        ...base,
        outcome: SourceOutcome.OK,
        key: `input:${source.inputSlug}`,
        bytes: archivo.buffer,
      };
    }

    if (!source.documentId) {
      // No debería llegar acá — el use case lo valida al guardar — pero no vale la pena tumbar
      // la descarga de todo un lote por una fila mal configurada.
      this.logger.warn(`Fuente ${source.id} sin documentId ni inputId: se omite.`);
      return { ...base, outcome: SourceOutcome.CONFIG_INVALIDA };
    }

    const target = await this.userDocumentsRepo.findDocumentTargetById(
      source.documentId,
      applicability,
    );
    if (!target.found || !target.applicable) {
      return { ...base, outcome: SourceOutcome.NO_APLICA };
    }

    const history = await this.userDocumentsRepo.findHistoryByUserAndTarget(
      userId,
      target.documentId,
      target.documentSponsorId,
    );
    const lastEntry = history[history.length - 1];
    if (!lastEntry?.url) return { ...base, outcome: SourceOutcome.SIN_ARCHIVO };

    return { ...base, outcome: SourceOutcome.OK, key: source.documentId, url: lastEntry.url };
  }

  /**
   * Extensión con la que se va a escribir un archivo. En `ARCHIVO_ORIGINAL` no se sabe sin bajarlo,
   * porque el formato real se detecta por los bytes: el preview lo muestra como tal.
   */
  static extensionFor(output: SponsorPackageOutput): string | null {
    return output.mode === PackageOutputMode.PDF_COMBINADO ? 'pdf' : null;
  }
}
