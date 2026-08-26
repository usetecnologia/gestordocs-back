import { SponsorPackage } from './sponsor-package.entity';

/**
 * Dimensiones con las que se resuelve qué paquete le toca a un participante. Programa y país salen
 * del **proceso abierto**, no del `User`: si cambió de programa después de abrir el ciclo, el
 * paquete que le corresponde es el del ciclo. Es el mismo criterio con el que se arma la carpeta.
 */
export interface PackageScopeContext {
  readonly programId: string | null;
  readonly countryId: string | null;
}

/**
 * Un candidato aplica si cada dimensión que declara coincide con la del participante. Las
 * dimensiones en null son comodines: aplican a todos.
 */
function aplica(pkg: SponsorPackage, { programId, countryId }: PackageScopeContext): boolean {
  if (pkg.programId !== null && pkg.programId !== programId) return false;
  if (pkg.countryId !== null && pkg.countryId !== countryId) return false;
  return true;
}

/**
 * Especificidad del alcance. Programa pesa más que país: es la dimensión que más manda en qué
 * documentos existen, así que un paquete atado al programa le gana a uno atado al país.
 *
 *   3 = sponsor + programa + país
 *   2 = sponsor + programa
 *   1 = sponsor + país
 *   0 = sponsor (el genérico)
 */
function especificidad(pkg: SponsorPackage): number {
  if (pkg.programId !== null && pkg.countryId !== null) return 3;
  if (pkg.programId !== null) return 2;
  if (pkg.countryId !== null) return 1;
  return 0;
}

/**
 * Elige el paquete que le corresponde al participante entre los candidatos activos de su sponsor.
 * Gana el de alcance más específico; a igual especificidad gana el de mayor `priority`, y si aún
 * hay empate el más antiguo — el orden final es determinista a propósito, para que dos corridas
 * sobre la misma configuración no puedan armar paquetes distintos.
 *
 * Devuelve null cuando ningún candidato aplica: el llamador omite al participante con motivo, sin
 * cortar el lote.
 *
 * Es una función pura: no toca base de datos y por lo tanto se testea sola.
 */
export function resolveSponsorPackage(
  candidatos: readonly SponsorPackage[],
  context: PackageScopeContext,
): SponsorPackage | null {
  const elegibles = candidatos.filter((pkg) => aplica(pkg, context));
  if (!elegibles.length) return null;

  return elegibles.reduce((mejor, actual) => {
    const espActual = especificidad(actual);
    const espMejor = especificidad(mejor);
    if (espActual !== espMejor) return espActual > espMejor ? actual : mejor;

    if (actual.priority !== mejor.priority) return actual.priority > mejor.priority ? actual : mejor;

    const tActual = actual.createdAt.getTime();
    const tMejor = mejor.createdAt.getTime();
    if (tActual !== tMejor) return tActual < tMejor ? actual : mejor;

    return actual.id < mejor.id ? actual : mejor;
  });
}
