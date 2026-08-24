export type ProcesoEstado = 'EN_PROCESO' | 'FINALIZADO';

/**
 * Una participación del alumno en un ciclo. Es el dueño histórico del avance documental: cuando un
 * proceso se finaliza queda congelado, y el siguiente empieza de cero sin heredar nada.
 *
 * `activo` es espejo de `estado` y existe solo para la restricción `uq_proceso_activo`: vale `true`
 * mientras el proceso está abierto y `null` cuando se finaliza — nunca `false`. Como los NULL no
 * colisionan en un índice único de MariaDB, la base admite N procesos finalizados y como mucho uno
 * abierto por participante. No se escribe a mano: lo mantiene el repositorio junto con `estado`.
 */
export class Proceso {
  constructor(
    public readonly id: string,
    public readonly participanteId: string,
    public readonly programId: string,
    public readonly optionProgramId: string,
    public readonly countryId: string,
    public readonly sponsorId: string | null,
    public readonly temporadaId: string | null,
    public readonly estado: ProcesoEstado,
    public readonly statusDocumental: string,
    public readonly activo: boolean | null,
    public readonly fechaIngreso: Date,
  ) {}
}
