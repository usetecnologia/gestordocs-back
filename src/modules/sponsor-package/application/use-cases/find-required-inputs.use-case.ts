import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ISponsorPackageRepository,
  SPONSOR_PACKAGE_REPOSITORY,
} from '../../domain/sponsor-package.repository';
import { AttachedInput } from '../services/sponsor-package-planner.service';

/**
 * Qué archivos hay que adjuntar para descargar a un conjunto de participantes.
 *
 * Existe para que el front deje de asumir que el único adjunto del mundo es el VacationLetter de
 * AAG: pregunta por los sponsors que aparecen en el listado y arma el diálogo con lo que le
 * respondan. Un adjunto nuevo configurado en el admin funciona sin tocar el front.
 *
 * Devuelve solo lo que el que descarga necesita saber —cómo se llama el campo, qué mostrarle al
 * usuario y qué acepta—, no la configuración completa: en qué carpeta de S3 se archiva es asunto
 * del admin, y este endpoint lo usa todo el staff.
 */
export interface RequiredInput {
  slug: string;
  label: string;
  required: boolean;
  mimeType: string;
  maxSizeMb: number;
  /** Códigos de sponsor que piden este adjunto. Sirve para explicarle al usuario por qué se lo piden. */
  sponsorCodes: string[];
}

export interface DownloadRequirements {
  /**
   * De los sponsors consultados, cuáles tienen un paquete activo.
   *
   * Se devuelve junto con los adjuntos porque el front necesita las dos respuestas para la misma
   * decisión: si mostrar el botón de descarga y qué pedir antes. Sin esto el front mantenía su
   * propia lista fija de "sponsors que tienen descarga", que quedaba desactualizada en cuanto
   * alguien configuraba un paquete nuevo.
   */
  sponsorsWithPackage: string[];
  inputs: RequiredInput[];
}

@Injectable()
export class FindRequiredInputsUseCase {
  constructor(
    @Inject(SPONSOR_PACKAGE_REPOSITORY)
    private readonly repo: ISponsorPackageRepository,
  ) {}

  async execute(sponsorCodes: readonly string[]): Promise<DownloadRequirements> {
    if (!sponsorCodes.length) return { sponsorsWithPackage: [], inputs: [] };

    const paquetes = await this.repo.findActiveBySponsorCodes(sponsorCodes);

    // Dos sponsors pueden pedir el mismo adjunto: se unifica por slug, que es el nombre del campo
    // en el multipart y por lo tanto lo que no puede repetirse.
    const porSlug = new Map<string, RequiredInput>();

    for (const paquete of paquetes) {
      for (const input of paquete.inputs) {
        const existente = porSlug.get(input.slug);

        if (!existente) {
          porSlug.set(input.slug, {
            slug: input.slug,
            label: input.label,
            required: input.required,
            mimeType: input.mimeType,
            maxSizeMb: input.maxSizeMb,
            sponsorCodes: [paquete.sponsorCode],
          });
          continue;
        }

        existente.sponsorCodes.push(paquete.sponsorCode);
        // Si dos paquetes configuran el mismo slug con topes distintos, gana el más restrictivo:
        // es el único valor con el que el archivo sirve para los dos.
        existente.maxSizeMb = Math.min(existente.maxSizeMb, input.maxSizeMb);
        existente.required = existente.required || input.required;
      }
    }

    return {
      sponsorsWithPackage: [...new Set(paquetes.map((p) => p.sponsorCode))].sort(),
      inputs: [...porSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
    };
  }
}

/**
 * Valida los archivos adjuntos contra lo que pide la configuración.
 *
 * No puede ser un pipe: un pipe corre antes de saber qué paquetes intervienen, y el tipo y el tamaño
 * aceptados los define cada adjunto en `sponsor_package_inputs`. Por eso se valida acá, con los
 * requisitos ya resueltos.
 *
 * Un adjunto que nadie pide no es un error: se ignora. El caso real es la descarga masiva de un
 * listado mixto, donde el usuario adjunta lo que hace falta para algunos sponsors y no para otros.
 */
export function assertAttachedInputsAreValid(
  // Forma estructural mínima: sirve tanto para `RequiredInput` como para los `inputs` del catálogo,
  // que es lo que tiene a mano cada caso de uso.
  requeridos: readonly { slug: string; label: string; mimeType: string; maxSizeMb: number }[],
  attached: readonly AttachedInput[],
): void {
  const problemas: string[] = [];
  const porSlug = new Map(requeridos.map((r) => [r.slug, r]));

  for (const archivo of attached) {
    const spec = porSlug.get(archivo.slug);
    if (!spec) continue;

    if (spec.mimeType && archivo.mimetype !== spec.mimeType) {
      problemas.push(`"${spec.label}" debe ser un archivo ${spec.mimeType}`);
    }

    const maxBytes = spec.maxSizeMb * 1024 * 1024;
    if (archivo.buffer.length > maxBytes) {
      problemas.push(`"${spec.label}" no debe superar los ${spec.maxSizeMb} MB`);
    }
  }

  if (problemas.length) throw new BadRequestException(problemas.join('. '));
}
