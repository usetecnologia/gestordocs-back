import { Inject, Injectable } from '@nestjs/common';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
  ProcesoHistorialItem,
} from '../../domain/proceso.repository';

@Injectable()
export class FindHistorialProcesosUseCase {
  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  /**
   * Todos los ciclos que tuvo el participante, del más reciente al más antiguo.
   *
   * Es información de USE. El participante **nunca** ve sus procesos anteriores —esa es la regla del
   * proceso visible— así que el endpoint que la expone es solo para staff.
   *
   * Devuelve lista vacía si no tiene ninguno en vez de fallar: un participante sin procesos es un
   * caso raro pero no un error, y una pantalla de historial vacía se explica sola.
   */
  execute(participanteId: string): Promise<ProcesoHistorialItem[]> {
    return this.procesoRepo.findHistorialByParticipante(participanteId);
  }
}
