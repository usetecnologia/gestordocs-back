import type { Proceso } from './proceso.entity';

/** Lo que hace falta saber del usuario para decidir si se le puede abrir un proceso, y con qué. */
export interface ParticipanteParaProceso {
  id: string;
  roleCode: string | null;
  programId: string | null;
  optionProgramId: string | null;
  countryId: string | null;
  sponsorId: string | null;
  status: string;
}

export interface CreateProcesoData {
  participanteId: string;
  programId: string;
  optionProgramId: string;
  countryId: string;
  sponsorId: string | null;
  temporadaId: string | null;
  statusDocumental: string;
}

/**
 * Un ciclo tal como se lee en el historial. No es la entidad `Proceso`: trae los nombres ya
 * resueltos y el conteo de documentos, porque el historial es una vista de lectura y quien lo
 * consume no debería tener que pedir cinco cosas más para mostrarlo.
 */
export interface ProcesoHistorialItem {
  id: string;
  estado: string;
  statusDocumental: string;
  fechaIngreso: Date;
  finalizadoAt: Date | null;
  finalizadoPor: string | null;
  programa: string | null;
  opcion: string | null;
  pais: string | null;
  sponsor: string | null;
  temporada: string | null;
  /** Documentos vigentes del ciclo, y cuántos de ellos tienen avance real (no `PENDIENTE`). */
  documentos: number;
  documentosConAvance: number;
  /** El que el participante ve hoy. Solo uno de la lista lo es. */
  esVisible: boolean;
}

export interface IProcesoRepository {
  /**
   * Todos los ciclos del participante, del más reciente al más antiguo. Es información de USE: el
   * participante nunca ve sus procesos anteriores.
   */
  findHistorialByParticipante(participanteId: string): Promise<ProcesoHistorialItem[]>;
  /**
   * Proceso visible del participante: el que está abierto y, si no tiene ninguno abierto, el más
   * reciente. Es la misma regla con la que el backfill repartió `UserDocuments.proceso_id`, escrita
   * una sola vez para que la base y el código no puedan discrepar.
   */
  findVisibleByParticipante(participanteId: string): Promise<Proceso | null>;
  /** Solo el proceso abierto. `null` si el participante no tiene ninguno en curso. */
  findAbiertoByParticipante(participanteId: string): Promise<Proceso | null>;
  /** El último proceso finalizado, que es el que reabre `ContinuarProceso`. */
  findUltimoFinalizadoByParticipante(participanteId: string): Promise<Proceso | null>;
  findParticipanteParaProceso(userId: string): Promise<ParticipanteParaProceso | null>;
  /** Los endpoints de USE identifican al participante por DNI, como el resto de las acciones masivas. */
  findParticipanteIdByDni(dni: string): Promise<string | null>;
  /** Temporada activa del programa; la última creada si hay varias; `null` si no tiene ninguna. */
  findTemporadaActivaDeProgram(programId: string): Promise<string | null>;
  /**
   * Crea el proceso abierto. `estado` y `activo` se escriben únicamente desde el repositorio —
   * son un par que no puede quedar descoordinado, y estos tres métodos son los únicos que lo tocan.
   */
  crearProcesoAbierto(data: CreateProcesoData): Promise<Proceso>;
  /**
   * Abre el ciclo siguiente de un participante que ya tuvo procesos. Además de crear el proceso,
   * pone `User.status` en el estado inicial con su fila de historial: es el espejo del proceso
   * activo, y si quedara con el estado del ciclo anterior el embudo mostraría un avance que ya no
   * existe. Va todo en la misma transacción.
   */
  crearProcesoDeNuevoCiclo(data: CreateProcesoData): Promise<Proceso>;
  /** `FINALIZADO` + `activo = null`, con quién y cuándo lo finalizó. */
  finalizar(procesoId: string, finalizadoById: string): Promise<Proceso>;
  /** `EN_PROCESO` + `activo = true`, limpiando la finalización. Deja el avance intacto. */
  reabrir(procesoId: string): Promise<Proceso>;
}

export const PROCESO_REPOSITORY = Symbol('PROCESO_REPOSITORY');
