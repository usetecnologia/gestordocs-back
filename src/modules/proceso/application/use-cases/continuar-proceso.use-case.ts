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
   * Reabre el último proceso finalizado del participante, **el mismo registro**, conservando todo
   * su avance: los documentos no se tocan. Es el "deshacer" de una finalización por error, y solo
   * lo puede hacer USE.
   *
   * Se distingue de `CrearNuevoProceso` justamente en eso: continuar no crea nada ni reinicia
   * documentos; abrir un ciclo nuevo desde cero es la otra acción.
   *
   * Limpia `finalizadoAt` y `finalizadoById`: si la finalización fue un error, no debe quedar
   * registrada como si hubiera ocurrido.
   */
  async execute(dni: string): Promise<void> {
    const participanteId = await this.procesoRepo.findParticipanteIdByDni(dni);
    if (!participanteId) {
      throw new NotFoundException(`No existe un participante con el DNI ${dni}.`);
    }

    // Reabrir con otro proceso ya abierto violaría `uq_proceso_activo`. Se corta antes para dar un
    // mensaje que se entienda, en vez de dejar salir el error de la base.
    const abierto = await this.procesoRepo.findAbiertoByParticipante(participanteId);
    if (abierto) {
      throw new ConflictException(
        'El participante ya tiene un proceso abierto: no hay nada que continuar.',
      );
    }

    const finalizado = await this.procesoRepo.findUltimoFinalizadoByParticipante(participanteId);
    if (!finalizado) {
      throw new NotFoundException('El participante no tiene ningún proceso finalizado.');
    }

    await this.procesoRepo.reabrir(finalizado.id);
    this.logger.log(`Proceso ${finalizado.id} reabierto para el participante ${participanteId}.`);
  }
}
