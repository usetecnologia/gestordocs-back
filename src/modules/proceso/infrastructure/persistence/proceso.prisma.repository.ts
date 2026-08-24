import { Injectable } from '@nestjs/common';
import { $Enums, Prisma } from 'prisma/generated/prisma/client';
import { PrismaService } from '@shared/prisma/prisma.service';
import type { Proceso } from '../../domain/proceso.entity';
import {
  CreateProcesoData,
  IProcesoRepository,
  ParticipanteParaProceso,
  ProcesoHistorialItem,
} from '../../domain/proceso.repository';
import { ProcesoMapper } from './proceso.mapper';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/**
 * `estado` y `activo` son un par que no puede quedar descoordinado: `activo` vale `true` mientras el
 * proceso está `EN_PROCESO` y `null` cuando está `FINALIZADO` — nunca `false`, porque de eso depende
 * `uq_proceso_activo` (los NULL no colisionan en un índice único de MariaDB).
 *
 * Están acá, como las dos únicas combinaciones válidas, para que ningún método pueda escribir una a
 * medias. Los tres que las usan —crear, finalizar y reabrir— son los únicos que tocan ese par.
 */
const ABIERTO = { estado: 'EN_PROCESO', activo: true } as const;
const FINALIZADO = { estado: 'FINALIZADO', activo: null } as const;

@Injectable()
export class ProcesoPrismaRepository implements IProcesoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findVisibleByParticipante(participanteId: string): Promise<Proceso | null> {
    // `activo: 'desc'` deja primero el proceso abierto (true) y después los finalizados (null),
    // que es el orden que define "proceso visible"; `fechaIngreso` desempata entre finalizados.
    const row = await this.prisma.proceso.findFirst({
      where: { participanteId },
      orderBy: [{ activo: 'desc' }, { fechaIngreso: 'desc' }],
    });
    return row ? ProcesoMapper.toDomain(row) : null;
  }

  async findAbiertoByParticipante(participanteId: string): Promise<Proceso | null> {
    // Se filtra por `activo` y no por `estado`: `activo` es la columna sobre la que la base
    // garantiza que haya como mucho uno, así que preguntarle a ella no puede devolver dos.
    const row = await this.prisma.proceso.findFirst({
      where: { participanteId, activo: true },
    });
    return row ? ProcesoMapper.toDomain(row) : null;
  }

  async findUltimoFinalizadoByParticipante(participanteId: string): Promise<Proceso | null> {
    const row = await this.prisma.proceso.findFirst({
      where: { participanteId, estado: 'FINALIZADO' },
      orderBy: [{ finalizadoAt: 'desc' }, { fechaIngreso: 'desc' }],
    });
    return row ? ProcesoMapper.toDomain(row) : null;
  }

  async findHistorialByParticipante(participanteId: string): Promise<ProcesoHistorialItem[]> {
    const [usuario, procesos] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: participanteId },
        select: { procesoVisibleId: true },
      }),
      this.prisma.proceso.findMany({
        where: { participanteId },
        orderBy: { fechaIngreso: 'desc' },
        select: {
          id: true,
          estado: true,
          statusDocumental: true,
          fechaIngreso: true,
          finalizadoAt: true,
          program: { select: { name: true } },
          optionProgram: { select: { shortDatabase: true } },
          country: { select: { name: true } },
          sponsor: { select: { name: true } },
          temporada: { select: { name: true } },
          finalizadoBy: { select: { id: true } },
        },
      }),
    ]);
    if (procesos.length === 0) return [];

    // Los conteos van en una consulta agrupada y no en un `_count` por fila: son dos numeros por
    // proceso —vigentes y con avance— y agrupar una vez evita una consulta por ciclo.
    const conteos = await this.prisma.userDocuments.groupBy({
      by: ['procesoId', 'status'],
      where: { procesoId: { in: procesos.map((p) => p.id) }, statusDocument: true },
      _count: { _all: true },
    });

    const totales = new Map<string, { documentos: number; conAvance: number }>();
    for (const fila of conteos) {
      const acc = totales.get(fila.procesoId) ?? { documentos: 0, conAvance: 0 };
      const n = fila._count._all;
      acc.documentos += n;
      if (fila.status !== 'PENDIENTE') acc.conAvance += n;
      totales.set(fila.procesoId, acc);
    }

    // El nombre de quien finalizo se resuelve aparte: `Person` y `User` comparten el id, pero no hay
    // relacion declarada entre los dos modelos (deuda 3.1 del plan), asi que no se puede incluir.
    const finalizadores = procesos
      .map((p) => p.finalizadoBy?.id)
      .filter((id): id is string => !!id);
    const nombres = new Map<string, string>();
    if (finalizadores.length > 0) {
      const personas = await this.prisma.person.findMany({
        where: { id: { in: finalizadores } },
        select: { id: true, firstname: true, lastfathername: true },
      });
      for (const persona of personas) {
        nombres.set(persona.id, `${persona.firstname} ${persona.lastfathername}`.trim());
      }
    }

    return procesos.map((p) => {
      const total = totales.get(p.id) ?? { documentos: 0, conAvance: 0 };
      return {
        id: p.id,
        estado: p.estado,
        statusDocumental: p.statusDocumental,
        fechaIngreso: p.fechaIngreso,
        finalizadoAt: p.finalizadoAt,
        finalizadoPor: p.finalizadoBy ? (nombres.get(p.finalizadoBy.id) ?? null) : null,
        programa: p.program?.name ?? null,
        opcion: p.optionProgram?.shortDatabase ?? null,
        pais: p.country?.name ?? null,
        sponsor: p.sponsor?.name ?? null,
        temporada: p.temporada?.name ?? null,
        documentos: total.documentos,
        documentosConAvance: total.conAvance,
        esVisible: p.id === usuario?.procesoVisibleId,
      };
    });
  }

  async findParticipanteParaProceso(
    userId: string,
  ): Promise<ParticipanteParaProceso | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        programId: true,
        optionProgramId: true,
        countryId: true,
        sponsorId: true,
        status: true,
        role: { select: { code: true, name: true } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      // Mismo criterio que usan los tres caminos que firman token: el `code` del rol y, si es
      // nulo, su nombre.
      roleCode: user.role.code ?? user.role.name,
      programId: user.programId,
      optionProgramId: user.optionProgramId,
      countryId: user.countryId,
      sponsorId: user.sponsorId,
      status: user.status,
    };
  }

  async findParticipanteIdByDni(dni: string): Promise<string | null> {
    // `Person` y `User` comparten el id, igual que en `findUserIdByDni` del módulo de documentos.
    const person = await this.prisma.person.findFirst({ where: { dni }, select: { id: true } });
    if (!person) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: person.id },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async findTemporadaActivaDeProgram(programId: string): Promise<string | null> {
    const temporada = await this.prisma.temporada.findFirst({
      where: { programId, status: true },
      orderBy: { createAt: 'desc' },
      select: { id: true },
    });
    return temporada?.id ?? null;
  }

  async crearProcesoAbierto(data: CreateProcesoData): Promise<Proceso> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.proceso.create({
          data: {
            participanteId: data.participanteId,
            programId: data.programId,
            optionProgramId: data.optionProgramId,
            countryId: data.countryId,
            sponsorId: data.sponsorId,
            temporadaId: data.temporadaId,
            statusDocumental: data.statusDocumental as $Enums.UserStatus,
            ...ABIERTO,
          },
        });
        // El proceso recién abierto pasa a ser el visible. Es el único de los tres momentos en que
        // el puntero cambia de valor de verdad; los otros dos lo reescriben igual, ver abajo.
        await tx.user.update({
          where: { id: data.participanteId },
          data: { procesoVisibleId: creado.id },
        });
        return creado;
      });
      return ProcesoMapper.toDomain(row);
    } catch (error) {
      // Dos sincronizaciones concurrentes del mismo participante pueden intentar abrirle el
      // proceso a la vez; `uq_proceso_activo` deja pasar una sola. La que pierde la carrera no
      // tiene nada que aportar: se queda con el proceso que creó la otra.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        const existente = await this.findVisibleByParticipante(data.participanteId);
        if (existente) return existente;
      }
      throw error;
    }
  }

  async crearProcesoDeNuevoCiclo(data: CreateProcesoData): Promise<Proceso> {
    const row = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.proceso.create({
        data: {
          participanteId: data.participanteId,
          programId: data.programId,
          optionProgramId: data.optionProgramId,
          countryId: data.countryId,
          sponsorId: data.sponsorId,
          temporadaId: data.temporadaId,
          statusDocumental: data.statusDocumental as $Enums.UserStatus,
          ...ABIERTO,
        },
      });

      // El estado del participante vuelve al inicial junto con el ciclo: es el espejo del proceso
      // activo. Con su fila de historial, para que el cambio quede trazado como cualquier otro.
      await tx.user.update({
        where: { id: data.participanteId },
        data: {
          procesoVisibleId: creado.id,
          status: data.statusDocumental as $Enums.UserStatus,
        },
      });
      await tx.userHistoryStatus.create({
        data: {
          userId: data.participanteId,
          status: data.statusDocumental as $Enums.UserStatus,
        },
      });

      return creado;
    });
    return ProcesoMapper.toDomain(row);
  }

  async finalizar(procesoId: string, finalizadoById: string): Promise<Proceso> {
    return this.escribirYFijarVisible(procesoId, {
      ...FINALIZADO,
      finalizadoAt: new Date(),
      finalizadoById,
    });
  }

  async reabrir(procesoId: string): Promise<Proceso> {
    // La finalización se borra: si fue un error, no debe quedar registrada como si hubiera
    // ocurrido. El avance documental no se toca — reabrir es el "deshacer", no un reinicio.
    return this.escribirYFijarVisible(procesoId, {
      ...ABIERTO,
      finalizadoAt: null,
      finalizadoById: null,
    });
  }

  /**
   * Escribe el proceso y deja el puntero `User.procesoVisibleId` apuntándole, en una transacción.
   *
   * Al finalizar y al reabrir el puntero ya debería apuntar acá —la regla es "el abierto y, si no
   * hay ninguno, el más reciente", y en los dos casos ese es este proceso—, así que reescribirlo es
   * idempotente. Se hace igual porque cuesta nada y convierte los tres momentos en el mismo
   * mecanismo: si el puntero se hubiera desincronizado por cualquier vía, la siguiente acción de USE
   * lo corrige sola.
   */
  private async escribirYFijarVisible(
    procesoId: string,
    data: Prisma.ProcesoUncheckedUpdateInput,
  ): Promise<Proceso> {
    const row = await this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.proceso.update({ where: { id: procesoId }, data });
      await tx.user.update({
        where: { id: actualizado.participanteId },
        data: { procesoVisibleId: actualizado.id },
      });
      return actualizado;
    });
    return ProcesoMapper.toDomain(row);
  }
}
