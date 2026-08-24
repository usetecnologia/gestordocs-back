import { Inject, Injectable, Logger } from '@nestjs/common';
import { RoleCode } from '@common/enums/role-code.enum';
import type { Proceso } from '../../domain/proceso.entity';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';
import { CrearNuevoProcesoUseCase } from './crear-nuevo-proceso.use-case';

@Injectable()
export class EnsureProcesoInicialUseCase {
  private readonly logger = new Logger(EnsureProcesoInicialUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
    private readonly crearNuevoProceso: CrearNuevoProcesoUseCase,
  ) {}

  /**
   * Devuelve el proceso **abierto** del participante, abriéndoselo si no tiene ninguno. Es el punto
   * único por el que un participante obtiene un proceso: lo llama la sincronización de documentos,
   * que es por donde pasan todos los caminos que arman un expediente (autologin, info del
   * participante, carga masiva y los listados que sincronizan al vuelo).
   *
   * Cubre los dos casos, y **los dos son automáticos** — no hay endpoint ni pantalla para ninguno:
   *
   * - **Primer proceso**: el participante no tiene ninguno. Se le abre copiando `User.status`, para
   *   no perderle el lugar en el embudo.
   * - **Ciclo siguiente**: ya tuvo procesos y USE le cerró el último. Se le abre uno nuevo desde
   *   cero (`CrearNuevoProceso`), y la sincronización le da de alta todos los documentos en
   *   `PENDIENTE`.
   *
   * El ciclo cerrado **no se toca en ningún caso**: sus documentos cuelgan de su propio proceso y la
   * sincronización solo mira los del abierto. El congelado es una propiedad del modelo, no una
   * condición que haya que recordar chequear.
   *
   * Devuelve `null` cuando no se le puede abrir un proceso — no es participante, o le falta
   * programa, opción o país, que en `procesos` son NOT NULL. Quien llama decide qué hacer con eso;
   * el sync se abstiene de tocar el expediente, igual que ya hace cuando falta el programa.
   */
  async execute(userId: string): Promise<Proceso | null> {
    const abierto = await this.procesoRepo.findAbiertoByParticipante(userId);
    if (abierto) return abierto;

    const participante = await this.procesoRepo.findParticipanteParaProceso(userId);
    if (!participante) {
      this.logger.warn(`No se puede abrir proceso: el usuario ${userId} no existe.`);
      return null;
    }

    // El staff de USE no tiene proceso por diseño: los procesos son del participante.
    if (participante.roleCode !== RoleCode.PARTICIPANTE) {
      return null;
    }

    // Si ya tuvo un proceso y lo cerraron, lo que corresponde es un ciclo nuevo y no repetir el
    // primero: el estado documental arranca de cero en vez de copiar el del ciclo anterior.
    const anterior = await this.procesoRepo.findUltimoFinalizadoByParticipante(userId);
    if (anterior) {
      return this.crearNuevoProceso.execute(participante);
    }

    const { programId, optionProgramId, countryId } = participante;
    if (!programId || !optionProgramId || !countryId) {
      const falta = !programId ? 'programa' : !optionProgramId ? 'opción' : 'país';
      this.logger.warn(
        `No se puede abrir proceso para el participante ${userId}: no tiene ${falta} asignado.`,
      );
      return null;
    }

    const temporadaId = await this.procesoRepo.findTemporadaActivaDeProgram(programId);

    // `sponsorId` se toma del participante tal como está en base: el upsert de Workuse ya aplicó
    // la regla de negocio (solo un contratado, `status_hired = 1`, conserva su sponsor). Sin
    // sponsor, el proceso arranca con los documentos generales nada más.
    //
    // `statusDocumental` copia `User.status` en vez de nacer en SIN_DOCUMENTOS: este caso cubre al
    // participante que ya existía y venía sin proceso, y ahí forzar SIN_DOCUMENTOS le borraría el
    // avance del embudo. Para el recién creado, `User.status` es el que le acaba de calcular el
    // alta. El ciclo siguiente sí arranca en SIN_DOCUMENTOS — ver `CrearNuevoProceso`.
    const proceso = await this.procesoRepo.crearProcesoAbierto({
      participanteId: participante.id,
      programId,
      optionProgramId,
      countryId,
      sponsorId: participante.sponsorId,
      temporadaId,
      statusDocumental: participante.status,
    });

    this.logger.log(
      `Proceso ${proceso.id} abierto para el participante ${userId} ` +
        `(temporada: ${temporadaId ?? 'ninguna'}).`,
    );
    return proceso;
  }
}
