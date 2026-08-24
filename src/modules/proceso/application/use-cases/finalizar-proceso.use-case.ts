import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

export interface FinalizarProcesoErrorItem {
  /** El id del ciclo que no se pudo cerrar. */
  procesoId: string;
  /** DNI del participante, para que el reporte se entienda. `null` si no lo tiene cargado. */
  dni: string | null;
  reason: string;
}

export interface FinalizarProcesoResult {
  totalSuccess: number;
  totalErrors: number;
  /** DNIs de los participantes cuyos ciclos se cerraron, para mostrar en el resultado. */
  successes: string[];
  errors: FinalizarProcesoErrorItem[];
}

@Injectable()
export class FinalizarProcesoUseCase {
  private readonly logger = new Logger(FinalizarProcesoUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  /**
   * Cierra **los ciclos indicados por su id**. Es una acción de USE únicamente: el participante no
   * puede finalizar el suyo.
   *
   * ⛔ **Se dirige al proceso, no al participante.** Antes recibía DNIs y cerraba "el ciclo abierto
   * de cada uno", y eso hacía algo que nadie pedía: con el listado filtrado a un ciclo finalizado,
   * finalizar cerraba el ciclo **abierto** de ese participante, que no estaba en la tabla. Lo que se
   * ve es lo que se cierra.
   *
   * Un ciclo que falla no detiene a los demás: se lista en `errors` con su motivo, igual que el
   * resto de las acciones masivas del proyecto. Finalizar de a uno es este mismo caso de uso con un
   * solo id.
   *
   * Lo que **no** hace: tocar los documentos. El expediente del ciclo cerrado queda tal como está —
   * es el registro histórico de ese ciclo.
   */
  async execute(
    procesoIds: readonly string[],
    finalizadoById: string,
  ): Promise<FinalizarProcesoResult> {
    const encontrados = await this.procesoRepo.findProcesosParaAccion(procesoIds);
    const porId = new Map(encontrados.map((p) => [p.id, p]));

    const successes: string[] = [];
    const errors: FinalizarProcesoErrorItem[] = [];

    for (const procesoId of procesoIds) {
      const proceso = porId.get(procesoId);
      if (!proceso) {
        errors.push({ procesoId, dni: null, reason: 'El proceso no existe.' });
        continue;
      }
      if (proceso.estado !== 'EN_PROCESO') {
        errors.push({
          procesoId,
          dni: proceso.dni,
          reason: 'Ese ciclo ya está finalizado.',
        });
        continue;
      }

      await this.procesoRepo.finalizar(procesoId, finalizadoById);
      successes.push(proceso.dni ?? procesoId);
    }

    this.logger.log(
      `FinalizarProceso — ${successes.length} finalizados, ${errors.length} sin finalizar.`,
    );

    return {
      totalSuccess: successes.length,
      totalErrors: errors.length,
      successes,
      errors,
    };
  }
}
