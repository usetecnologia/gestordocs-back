import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

@Injectable()
export class ContinuarProcesoUseCase {
  private readonly logger = new Logger(ContinuarProcesoUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  /**
   * Reabre **el ciclo indicado por su id**, conservando todo su avance: los documentos no se tocan.
   * Es el "deshacer" de una finalización por error, y solo lo puede hacer USE.
   *
   * Se dirige al proceso y no al participante por el mismo motivo que `FinalizarProceso`: la
   * pantalla muestra una fila por ciclo, y reabrir "el último finalizado" no era necesariamente el
   * que se estaba mirando.
   *
   * Se distingue de `CrearNuevoProceso` justamente en eso: continuar no crea nada ni reinicia
   * documentos; abrir un ciclo nuevo desde cero es la otra acción, y la hace el participante.
   *
   * Limpia `finalizadoAt` y `finalizadoById`: si la finalización fue un error, no debe quedar
   * registrada como si hubiera ocurrido.
   */
  async execute(procesoId: string): Promise<void> {
    const [proceso] = await this.procesoRepo.findProcesosParaAccion([procesoId]);
    if (!proceso) {
      throw new NotFoundException('El proceso no existe.');
    }
    if (proceso.estado !== 'FINALIZADO') {
      throw new ConflictException('Ese ciclo no está finalizado: no hay nada que continuar.');
    }

    // Reabrir con otro ciclo ya abierto violaría `uq_proceso_activo`. Se corta antes para dar un
    // mensaje que se entienda, en vez de dejar salir el error de la base.
    const abierto = await this.procesoRepo.findAbiertoByParticipante(proceso.participanteId);
    if (abierto) {
      throw new ConflictException(
        'El participante ya tiene un proceso abierto: hay que finalizarlo antes de reabrir este.',
      );
    }

    await this.procesoRepo.reabrir(proceso.id);
    this.logger.log(
      `Proceso ${proceso.id} reabierto para el participante ${proceso.participanteId}.`,
    );
  }
}
