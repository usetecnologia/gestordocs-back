import { Inject, Injectable, Logger } from '@nestjs/common';
import { RoleCode } from '@common/enums/role-code.enum';
import type { Proceso } from '../../domain/proceso.entity';
import {
  IProcesoRepository,
  PROCESO_REPOSITORY,
} from '../../domain/proceso.repository';

@Injectable()
export class EnsureProcesoInicialUseCase {
  private readonly logger = new Logger(EnsureProcesoInicialUseCase.name);

  constructor(
    @Inject(PROCESO_REPOSITORY)
    private readonly procesoRepo: IProcesoRepository,
  ) {}

  /**
   * Devuelve el proceso visible del participante, y **solo le crea uno si no tiene ninguno**.
   *
   * ⛔ **No abre el ciclo siguiente.** Lo hacía, y estaba mal: a este caso de uso lo llama la
   * sincronización de documentos, que corre desde siete caminos —incluido que alguien de USE abra el
   * expediente—, así que con solo mirar a un participante con el ciclo cerrado se le abría el
   * siguiente. Se vio en pruebas: entrar al detalle de un ciclo finalizado le creaba un ciclo nuevo.
   *
   * Abrir el ciclo siguiente es una decisión del participante: entra, ve que su proceso terminó y
   * pulsa el botón. Eso es `CrearNuevoProceso`, que tiene su propio endpoint.
   *
   * Cuando el participante tiene solo ciclos cerrados devuelve el más reciente —el visible— sin
   * crear nada. El sync ve que está `FINALIZADO` y no toca el expediente, que es lo correcto: un
   * ciclo cerrado está congelado.
   *
   * Devuelve `null` cuando no se le puede abrir el primero: no es participante, o le falta programa,
   * opción o país, que en `procesos` son NOT NULL.
   */
  async execute(userId: string): Promise<Proceso | null> {
    // Cualquier proceso existente —abierto o cerrado— significa que acá no hay nada que crear.
    const existente = await this.procesoRepo.findVisibleByParticipante(userId);
    if (existente) return existente;

    const participante = await this.procesoRepo.findParticipanteParaProceso(userId);
    if (!participante) {
      this.logger.warn(`No se puede abrir proceso: el usuario ${userId} no existe.`);
      return null;
    }

    // El staff de USE no tiene proceso por diseño: los procesos son del participante.
    if (participante.roleCode !== RoleCode.PARTICIPANTE) {
      return null;
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
    // avance del embudo. El ciclo siguiente sí arranca en SIN_DOCUMENTOS — ver `CrearNuevoProceso`.
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
      `Primer proceso ${proceso.id} abierto para el participante ${userId} ` +
        `(temporada: ${temporadaId ?? 'ninguna'}).`,
    );
    return proceso;
  }
}
