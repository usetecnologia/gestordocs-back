import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ExistingUserDocument,
  IUserDocumentsRepository,
  USER_DOCUMENTS_REPOSITORY,
} from '../../domain/user-documents.repository';
import {
  IDocumentRepository,
  DOCUMENT_REPOSITORY,
} from '@modules/document/domain/document.repository';
import { EnsureProcesoInicialUseCase } from '@modules/proceso/application/use-cases/ensure-proceso-inicial.use-case';

@Injectable()
export class SyncUserDocumentsUseCase {
  private readonly logger = new Logger(SyncUserDocumentsUseCase.name);

  constructor(
    @Inject(USER_DOCUMENTS_REPOSITORY)
    private readonly userDocumentsRepo: IUserDocumentsRepository,
    @Inject(DOCUMENT_REPOSITORY)
    private readonly documentRepo: IDocumentRepository,
    private readonly ensureProcesoInicial: EnsureProcesoInicialUseCase,
  ) {}

  /**
   * Pone el expediente del proceso abierto al día con el catálogo: crea en `PENDIENTE` lo que
   * corresponde y todavía no está, desactiva lo que dejó de aplicar, y no toca lo que el
   * participante ya subió y sigue aplicando.
   *
   * El contexto de aplicabilidad (sponsor + programa) se resuelve aquí a partir del `userId`,
   * no se recibe por parámetro: hay siete caminos que sincronizan un expediente y así ninguno
   * puede quedar pasando datos distintos ni desactualizarse cuando se agregue una dimensión.
   *
   * **Trabaja siempre dentro del proceso abierto.** Un ciclo no hereda nada del anterior: si el
   * participante ya pasó por otro sponsor en un proceso finalizado, los documentos de ese proceso
   * se quedan ahí. Antes existía esa herencia —se clonaba el avance de un sponsor a otro y se
   * refrescaba el registro con el archivo más nuevo de cualquier vínculo— y se eliminó a
   * propósito: el proceso es el dueño histórico de su avance, y mezclar dos ciclos hacía que un
   * expediente cerrado pudiera cambiar por la espalda.
   *
   * De ahí sale el congelado del ciclo cerrado, y sale **por construcción**: se lee y se escribe
   * únicamente sobre las filas del proceso abierto, así que las del finalizado no están al
   * alcance. Y si el participante no tiene ninguno abierto porque USE le cerró el anterior,
   * `EnsureProcesoInicial` le abre el siguiente solo — no hay nada que administrar.
   */
  async execute(userId: string): Promise<void> {
    const context = await this.userDocumentsRepo.findUserApplicabilityContext(userId);

    // Sin programa o sin país no se puede decidir qué documentos aplican. Se sale sin tocar
    // nada en vez de desactivar el expediente completo: el filtro estricto haría que ningún
    // documento calce, y perder un expediente por un dato faltante es peor que no sincronizar.
    if (!context?.programId || !context.countryId) {
      const falta = !context?.programId ? 'programa' : 'país';
      this.logger.warn(
        `Sync omitido para el usuario ${userId}: no tiene ${falta} asignado. ` +
          'Su expediente queda intacto hasta que se le asigne uno.',
      );
      return;
    }

    // El expediente cuelga de un proceso: `UserDocuments.procesoId` es lo que los une. Si el
    // participante todavía no tiene ninguno se le abre acá — este es su primer sync — y si no se
    // le puede abrir, no se sincroniza. Mismo criterio que el corte de arriba: dejarle el
    // expediente intacto es mejor que crearle documentos que no cuelgan de ningún proceso.
    const proceso = await this.ensureProcesoInicial.execute(userId);
    if (!proceso) {
      this.logger.warn(
        `Sync omitido para el usuario ${userId}: no se le pudo abrir un proceso. ` +
          'Su expediente queda intacto.',
      );
      return;
    }

    // Red de seguridad, no el mecanismo principal: `EnsureProcesoInicial` devuelve siempre un
    // proceso abierto, así que esta rama no debería alcanzarse. Se deja porque el día que alguien
    // la haga alcanzable —devolviendo el proceso visible en vez del abierto, por ejemplo— el sync
    // empezaría a editar un ciclo cerrado sin que nada fallara a la vista.
    if (proceso.estado === 'FINALIZADO') {
      this.logger.log(
        `Sync omitido para el usuario ${userId}: su proceso ${proceso.id} está finalizado.`,
      );
      return;
    }

    const { sponsorCode } = context;
    const documents = await this.documentRepo.findApplicableForParticipant(context);
    const existing = await this.userDocumentsRepo.findByProcesoId(proceso.id);

    // `existing` viene ordenado por última actividad real (updatedAt) del más reciente al más
    // antiguo, así que el primer valor que se guarda por clave es el de actividad más reciente.
    const existingByDocSponsorId = new Map<string, ExistingUserDocument>();
    const existingByDocId = new Map<string, ExistingUserDocument>();

    for (const e of existing) {
      if (e.documentSponsorId) {
        if (!existingByDocSponsorId.has(e.documentSponsorId)) {
          existingByDocSponsorId.set(e.documentSponsorId, e);
        }
      } else if (e.documentId && !existingByDocId.has(e.documentId)) {
        existingByDocId.set(e.documentId, e);
      }
    }

    // Qué identificadores siguen siendo válidos para este participante en esta pasada.
    const validDocSponsorIds = new Set<string>();
    const validDocIds = new Set<string>();

    for (const doc of documents) {
      if (doc.sponsors.length > 0) {
        // Documento exigido por sponsor: solo aplica el vínculo del sponsor actual. Si el
        // participante no está con ninguno de los que lo exigen, el documento no le toca.
        const matchingDs = doc.sponsors.find((s) => s.sponsor.code === sponsorCode);
        if (!matchingDs) continue;

        validDocSponsorIds.add(matchingDs.id);
        await this.crearOSincronizar(existingByDocSponsorId.get(matchingDs.id), doc.status, () =>
          this.userDocumentsRepo.createWithHistory({
            userId,
            procesoId: proceso.id,
            documentSponsorId: matchingDs.id,
          }),
        );
      } else {
        validDocIds.add(doc.id);
        await this.crearOSincronizar(existingByDocId.get(doc.id), doc.status, () =>
          this.userDocumentsRepo.createWithHistory({
            userId,
            procesoId: proceso.id,
            documentId: doc.id,
          }),
        );
      }
    }

    // Desactiva los registros que ya no corresponden a este participante. Cubre el cambio de
    // sponsor o de programa con el proceso abierto, y el documento que pasó de "visible para
    // todos" a "exigido por sponsor" y ahora el sponsor del participante no califica. Nunca se
    // borra nada: la fila queda inactiva y su historial intacto.
    for (const record of existing) {
      if (!record.statusDocument) continue;

      if (record.documentSponsorId) {
        if (!validDocSponsorIds.has(record.documentSponsorId)) {
          await this.userDocumentsRepo.updateStatusDocument(record.id, false);
        }
      } else if (record.documentId) {
        if (!validDocIds.has(record.documentId)) {
          await this.userDocumentsRepo.updateStatusDocument(record.id, false);
        }
      }
      // Una fila sin ninguno de los dos punteros no se toca: no hay con qué decidir si aplica.
    }
  }

  /**
   * Si el documento ya está en el expediente del proceso, solo se alinea su vigencia con la del
   * catálogo — **el estado y el archivo del participante no se tocan**, que es lo que hace que un
   * cambio de catálogo no le borre lo que ya subió. Si no está, se crea (en `PENDIENTE`, con su
   * primer historial), salvo que el documento esté dado de baja en el catálogo.
   */
  private async crearOSincronizar(
    record: ExistingUserDocument | undefined,
    vigenteEnCatalogo: boolean,
    crear: () => Promise<void>,
  ): Promise<void> {
    if (record) {
      if (record.statusDocument !== vigenteEnCatalogo) {
        await this.userDocumentsRepo.updateStatusDocument(record.id, vigenteEnCatalogo);
      }
      return;
    }
    if (!vigenteEnCatalogo) return;
    await crear();
  }
}
