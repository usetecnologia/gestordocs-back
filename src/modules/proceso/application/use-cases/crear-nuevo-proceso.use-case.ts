import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RoleCode } from '@common/enums/role-code.enum';
import { SyncUserDocumentsUseCase } from '@modules/user-documents/application/use-cases/sync-user-documents.use-case';
import type { Proceso } from '../../domain/proceso.entity';
import {
  IProcesoRepository,
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
    private readonly syncUserDocumentsUseCase: SyncUserDocumentsUseCase,
  ) {}

  /**
   * Abre el **siguiente** ciclo del participante. Lo dispara **él**, pulsando el botón que ve al
   * entrar cuando su proceso está finalizado.
   *
   * ⛔ **No es automático, y no debe volver a serlo.** Se probó colgándolo de `EnsureProcesoInicial`
   * —que llama la sincronización de documentos— y el resultado fue que abrir el expediente de un
   * participante desde el panel de USE le creaba un ciclo nuevo. Abrir un ciclo es una decisión, no
   * un efecto secundario de mirar una pantalla.
   *
   * Diferencias con el primer proceso del participante (`EnsureProcesoInicial`):
   *
   * - `statusDocumental` nace en `SIN_DOCUMENTOS` en vez de copiar `User.status`. El ciclo nuevo no
   *   hereda el avance del anterior: eso es lo que lo hace un ciclo nuevo.
   * - `User.status` se pone en `SIN_DOCUMENTOS` con su fila de historial, porque es el espejo del
   *   proceso activo. Va en la misma transacción que la creación: si se separaran, el participante
   *   quedaría con un proceso nuevo y el estado del viejo.
   *
   * Al final se sincroniza: el ciclo nuevo nace vacío, y el sync le da de alta todos los documentos
   * aplicables en `PENDIENTE`. Así el participante vuelve a su expediente y ya lo encuentra armado.
   */
  async execute(userId: string): Promise<Proceso> {
    // Un participante no puede tener dos ciclos abiertos: la base lo impide y acá se corta antes,
    // con un mensaje que se entienda.
    const abierto = await this.procesoRepo.findAbiertoByParticipante(userId);
    if (abierto) {
      throw new ConflictException('Ya tienes un proceso en curso.');
    }

    const participante = await this.procesoRepo.findParticipanteParaProceso(userId);
    if (!participante) {
      throw new NotFoundException('No se encontró el participante.');
    }
    if (participante.roleCode !== RoleCode.PARTICIPANTE) {
      throw new ConflictException('Solo un participante puede abrir un proceso.');
    }

    const { programId, optionProgramId, countryId } = participante;
    if (!programId || !optionProgramId || !countryId) {
      const falta = !programId ? 'programa' : !optionProgramId ? 'opción' : 'país';
      this.logger.warn(
        `No se puede abrir un ciclo nuevo para el participante ${userId}: no tiene ${falta} asignado.`,
      );
      throw new ConflictException(
        'Tus datos están incompletos para abrir un proceso nuevo. Comunícate con USE.',
      );
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
      `Ciclo nuevo: proceso ${proceso.id} abierto por el participante ${userId} ` +
        `(temporada: ${temporadaId ?? 'ninguna'}).`,
    );

    // El expediente del ciclo nuevo se arma acá mismo, para que el participante lo encuentre listo.
    await this.syncUserDocumentsUseCase.execute(userId);

    return proceso;
  }
}
