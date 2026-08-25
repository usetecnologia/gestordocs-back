import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

/**
 * Estados con los que el participante queda fuera del programa.
 *
 * `INACTIVO` es el que escriben el autologin y la sincronización masiva cuando Workuse reporta
 * `Retired`; `RETIRADO` lo escribe la carga masiva por Excel (ver `BulkLoadUsersUseCase`). Los dos
 * se muestran como "Retirado" en la UI, así que los dos cierran el ciclo.
 */
const ESTADOS_DE_RETIRO = new Set(['INACTIVO', 'RETIRADO']);

export function esEstadoDeRetiro(status: string | null | undefined): boolean {
  return !!status && ESTADOS_DE_RETIRO.has(status);
}

/**
 * Cierra el ciclo abierto de un participante que quedó retirado.
 *
 * Un retiro termina el proceso: dejarlo abierto lo mantenía en los listados de trabajo, en las
 * acciones masivas y en el reporte como si todavía hubiera algo que revisar. Se cierra solo, sin
 * intervención de USE, porque el retiro no lo decide USE — lo reporta Workuse.
 *
 * Es idempotente: si el participante no tiene ciclo abierto —porque ya se le cerró, o porque nunca
 * tuvo— no hace nada y devuelve `false`. Eso permite llamarlo en cada corrida sin condicionarlo.
 *
 * Lo que **no** hace: tocar el expediente. Los documentos del ciclo quedan tal como estaban, que es
 * el registro histórico de lo que el participante alcanzó a entregar antes de retirarse.
 */
@Injectable()
export class FinalizarProcesoPorRetiroUseCase {
  private readonly logger = new Logger(FinalizarProcesoPorRetiroUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  async execute(participanteId: string, finalizadoById: string): Promise<boolean> {
    const abierto = await this.procesoRepo.findAbiertoByParticipante(participanteId);
    if (!abierto) return false;

    await this.procesoRepo.finalizar(abierto.id, finalizadoById);
    this.logger.log(
      `Proceso ${abierto.id} finalizado automáticamente: el participante ${participanteId} quedó retirado.`,
    );
    return true;
  }
}
