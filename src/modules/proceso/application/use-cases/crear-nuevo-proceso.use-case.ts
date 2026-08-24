import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Proceso } from '../../domain/proceso.entity';
import {
  IProcesoRepository,
  ParticipanteParaProceso,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

/** Todo ciclo nuevo arranca sin nada subido, sin importar cómo cerró el anterior. */
const ESTADO_INICIAL = 'SIN_DOCUMENTOS';

@Injectable()
export class CrearNuevoProcesoUseCase {
  private readonly logger = new Logger(CrearNuevoProcesoUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  /**
   * Abre el **siguiente** ciclo de un participante que ya tuvo procesos y no tiene ninguno abierto.
   *
   * **No tiene endpoint ni pantalla: ocurre solo.** Lo llama `EnsureProcesoInicial`, que a su vez lo
   * llama la sincronización de documentos — es decir, la primera vez que el participante aparece
   * después de que USE le cerrara el ciclo anterior (su login, o cualquier camino que abra su
   * expediente). No hay botón que pulsar ni módulo que administrar.
   *
   * Los datos salen del último refresco de Workuse: `autologin` e `info-participant` hacen el POST y
   * actualizan al participante **antes** de sincronizar, así que las dimensiones que se copian acá
   * ya son las que Workuse acaba de reportar. Si ese POST falla, el camino se corta antes de llegar
   * hasta acá y no se crea nada — que es la condición que pedía el plan.
   *
   * Diferencias con el primer proceso del participante:
   *
   * - `statusDocumental` nace en `SIN_DOCUMENTOS` en vez de copiar `User.status`. El ciclo nuevo no
   *   hereda el avance del anterior: eso es justamente lo que lo hace un ciclo nuevo.
   * - `User.status` se pone en `SIN_DOCUMENTOS` con su fila de historial, porque es el espejo del
   *   proceso activo. Va en la misma transacción que la creación: si se separaran, el participante
   *   quedaría con un proceso nuevo y el estado del ciclo viejo.
   *
   * Los documentos no se crean acá. Los crea la sincronización, que al encontrar el proceso nuevo
   * vacío da de alta todos los aplicables en `PENDIENTE`.
   */
  async execute(participante: ParticipanteParaProceso): Promise<Proceso | null> {
    const { programId, optionProgramId, countryId } = participante;
    if (!programId || !optionProgramId || !countryId) {
      const falta = !programId ? 'programa' : !optionProgramId ? 'opción' : 'país';
      this.logger.warn(
        `No se puede abrir un ciclo nuevo para el participante ${participante.id}: ` +
          `no tiene ${falta} asignado.`,
      );
      return null;
    }

    const temporadaId = await this.procesoRepo.findTemporadaActivaDeProgram(programId);

    const proceso = await this.procesoRepo.crearProcesoDeNuevoCiclo({
      participanteId: participante.id,
      programId,
      optionProgramId,
      countryId,
      // El sponsor sale del participante tal como está en base: el upsert de Workuse ya aplicó la
      // regla `status_hired = 1`. Sin contrato, el ciclo nuevo arranca sin sponsor y solo con los
      // documentos generales.
      sponsorId: participante.sponsorId,
      temporadaId,
      statusDocumental: ESTADO_INICIAL,
    });

    this.logger.log(
      `Ciclo nuevo: proceso ${proceso.id} abierto automáticamente para el participante ` +
        `${participante.id} (temporada: ${temporadaId ?? 'ninguna'}).`,
    );
    return proceso;
  }
}
