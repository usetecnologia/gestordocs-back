import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

export interface FinalizarProcesoErrorItem {
  dni: string;
  reason: string;
}

export interface FinalizarProcesoResult {
  totalSuccess: number;
  totalErrors: number;
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
   * Cierra el proceso abierto de cada participante. Es una acción de USE únicamente: el
   * participante no puede finalizar el suyo, y de eso depende que no pueda abrir procesos en
   * cadena — para abrir otro tendría que cerrar el actual, y no puede.
   *
   * Un DNI que falla no detiene a los demás: se lista en `errors`, igual que el resto de las
   * acciones masivas del proyecto. Finalizar de a uno es este mismo caso de uso con un solo DNI.
   *
   * Lo que **no** hace: tocar los documentos. El expediente del proceso finalizado queda tal como
   * está — es el registro histórico de ese ciclo. Que el sync deje de tocarlo es el paso 6.
   */
  async execute(dnis: string[], finalizadoById: string): Promise<FinalizarProcesoResult> {
    const successes: string[] = [];
    const errors: FinalizarProcesoErrorItem[] = [];

    for (const dni of dnis) {
      const participanteId = await this.procesoRepo.findParticipanteIdByDni(dni);
      if (!participanteId) {
        errors.push({ dni, reason: 'No existe un participante con ese DNI.' });
        continue;
      }

      const abierto = await this.procesoRepo.findAbiertoByParticipante(participanteId);
      if (!abierto) {
        errors.push({ dni, reason: 'El participante no tiene un proceso abierto.' });
        continue;
      }

      await this.procesoRepo.finalizar(abierto.id, finalizadoById);
      successes.push(dni);
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
