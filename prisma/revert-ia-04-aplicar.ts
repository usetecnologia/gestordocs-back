import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { UserDocumentsModule } from '../src/modules/user-documents/user-documents.module';
import { TerminarRevisionUseCase } from '../src/modules/user-documents/application/use-cases/terminar-revision.use-case';

/**
 * FASE 3 — Reversión de las observaciones escritas por la corrida errónea del 4/8/2026.
 *
 *   Dry-run (por defecto):  npx ts-node -r tsconfig-paths/register prisma/revert-ia-04-aplicar.ts
 *   Aplicar:                npx ts-node -r tsconfig-paths/register prisma/revert-ia-04-aplicar.ts --apply
 *   Con guarda de conteo:   ... --apply --esperado=236
 *
 * Decisiones tomadas con el usuario el 5/8/2026:
 *   - Se excluyen: documentos ya tocados después de la corrida, Mariana (70627745), los
 *     participantes que hoy están INACTIVO, y dos registros de prueba.
 *   - Participantes en un estado bloqueado al sync (OBSERVADO_SPONSOR): en vez de restaurarles el
 *     estado a mano se ejecuta TerminarRevisionUseCase, que lo recalcula según sus documentos.
 *   - Al resto se le restaura el estado exacto que tenía antes de la corrida.
 *   - NO se envían correos: TerminarRevisionUseCase se llama con suppressParticipantEmail = true.
 *
 * Garantías:
 *   - Recalcula el conjunto EN VIVO en cada corrida; nunca lee una lista fija.
 *   - Cada escritura lleva su propia condición de guarda (el status esperado): si algo cambió entre
 *     el cálculo y la escritura, esa fila se omite y queda registrada, sin pisar trabajo de nadie.
 *   - Los lotes van en transacción: un fallo deja el lote entero sin aplicar.
 *   - Ningún documento se borra y S3 no se toca. Solo se eliminan las filas que creó la corrida.
 *   - El log guarda cada fila borrada COMPLETA, para poder reconstruirla sin recurrir al backup.
 */

const APPLY = process.argv.includes('--apply');
const ESPERADO = Number(process.argv.find((a) => a.startsWith('--esperado='))?.split('=')[1] ?? 0);
const TAMANO_LOTE = 50;
const LOG_DIR = 'reversion-ia';

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';
const AUTOR_CORRIDA = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';
const VENTANA_INICIO = new Date('2026-08-04T17:49:00.000Z');
const VENTANA_FIN = new Date('2026-08-04T21:47:00.000Z');

/** Excluidos por decisión explícita. */
const DNIS_PRUEBA = ['12345666', '12345678'];
const DNI_MARIANA = '70627745';

/** Estados que el sync diario no reevalúa: ahí se llama a TerminarRevisionUseCase. */
const ESTADOS_BLOQUEADOS = new Set([
  'ENVIADO_SPONSOR',
  'OBSERVADO_SPONSOR',
  'RECHAZADO_SPONSOR',
  'APROBADO_SPONSOR',
  'DS2019_EMITIDO',
  'RETENIDO_USE',
]);

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

interface Candidato {
  historialIaId: string;
  iaCreatedAt: Date;
  userDocumentId: string;
  userId: string;
  dni: string | null;
  nombre: string;
  docStatusActual: string;
  docStatusARestaurar: string | null;
  userStatusActual: string;
  userStatusARestaurar: string | null;
  historialesPosteriores: number;
  filaEstadoIaId: string | null;
}

type Exclusion = { candidato: Candidato; motivo: string };

async function cargarCandidatos(): Promise<{ todos: Candidato[]; excluidos: Exclusion[]; aplicables: Candidato[] }> {
  const filas = await prisma.$queryRaw<Candidato[]>`
    SELECT h.id          AS historialIaId,
           h.created_at  AS iaCreatedAt,
           ud.id         AS userDocumentId,
           ud.userId     AS userId,
           p.dni         AS dni,
           CONCAT_WS(' ', p.firstname, p.middlename, p.lastfathername, p.lastmothername) AS nombre,
           ud.status     AS docStatusActual,
           u.status      AS userStatusActual,
           (SELECT h2.status FROM UserDocumentHistory h2
             WHERE h2.userDocumentsId = ud.id AND h2.created_at < h.created_at
             ORDER BY h2.created_at DESC, h2.id DESC LIMIT 1) AS docStatusARestaurar,
           (SELECT COUNT(*) FROM UserDocumentHistory h3
             WHERE h3.userDocumentsId = ud.id AND h3.created_at > h.created_at) AS historialesPosteriores,
           (SELECT s.status FROM UserHistoryStatus s
             WHERE s.userId = ud.userId AND s.created_at < h.created_at
             ORDER BY s.created_at DESC LIMIT 1) AS userStatusARestaurar,
           (SELECT s2.id FROM UserHistoryStatus s2
             WHERE s2.userId = ud.userId
               AND s2.created_by_id = ${AUTOR_CORRIDA}
               AND s2.created_at >= h.created_at
               AND s2.created_at <= ${VENTANA_FIN}
             ORDER BY s2.created_at ASC LIMIT 1) AS filaEstadoIaId
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    LEFT JOIN Person p         ON p.id = ud.userId
    LEFT JOIN User u           ON u.id = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND h.created_by_id = ${AUTOR_CORRIDA}
      AND h.created_at BETWEEN ${VENTANA_INICIO} AND ${VENTANA_FIN}
    ORDER BY p.dni
  `;

  const todos = filas.map((f) => ({ ...f, historialesPosteriores: Number(f.historialesPosteriores) }));
  const excluidos: Exclusion[] = [];
  const aplicables: Candidato[] = [];

  for (const c of todos) {
    if (c.historialesPosteriores > 0) {
      excluidos.push({ candidato: c, motivo: `el documento fue tocado después (${c.historialesPosteriores} historial/es)` });
    } else if (c.dni === DNI_MARIANA) {
      excluidos.push({ candidato: c, motivo: 'excluida por decisión (ya resuelta manualmente)' });
    } else if (c.userStatusActual === 'INACTIVO') {
      excluidos.push({ candidato: c, motivo: 'participante INACTIVO — excluido por decisión' });
    } else if (c.dni && DNIS_PRUEBA.includes(c.dni)) {
      excluidos.push({ candidato: c, motivo: 'registro de prueba — excluido por decisión' });
    } else if (c.docStatusActual !== 'OBSERVADO') {
      excluidos.push({ candidato: c, motivo: `el documento ya no está OBSERVADO (está ${c.docStatusActual})` });
    } else if (!c.docStatusARestaurar) {
      excluidos.push({ candidato: c, motivo: 'no hay historial anterior: no se sabe a qué estado volver' });
    } else {
      aplicables.push(c);
    }
  }

  return { todos, excluidos, aplicables };
}

const usaTerminarRevision = (c: Candidato) => ESTADOS_BLOQUEADOS.has(c.userStatusActual);

async function main() {
  console.log(APPLY ? '=== MODO APPLY — SE ESCRIBIRÁ EN PRODUCCIÓN ===' : '=== DRY-RUN — no se escribe nada ===');
  console.log(`Base: ${process.env.DATABASE_DB} @ ${process.env.HOST_DB}:${process.env.PORT_DB}\n`);

  const { todos, excluidos, aplicables } = await cargarCandidatos();

  console.log(`Observaciones de la corrida encontradas: ${todos.length}`);
  console.log(`  Excluidas:   ${excluidos.length}`);
  console.log(`  A revertir:  ${aplicables.length}\n`);

  const porMotivo = new Map<string, number>();
  for (const e of excluidos) {
    const clave = e.motivo.replace(/\(\d+ historial\/es\)/, '(documento tocado)');
    porMotivo.set(clave, (porMotivo.get(clave) ?? 0) + 1);
  }
  console.log('--- Excluidos por motivo ---');
  console.table([...porMotivo.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })));
  excluidos.forEach((e) => console.log(`   DNI ${e.candidato.dni ?? 's/d'} — ${e.motivo}`));

  const conTerminar = aplicables.filter(usaTerminarRevision);
  const conRestauracion = aplicables.filter((c) => !usaTerminarRevision(c));

  console.log('\n--- Qué se hará con el estado del participante ---');
  console.table([
    { accion: 'Restaurar el estado anterior', casos: conRestauracion.length },
    { accion: 'TerminarRevisionUseCase (recalcula)', casos: conTerminar.length },
  ]);

  console.log('\n--- Estados de documento a restaurar ---');
  const porEstadoDoc = new Map<string, number>();
  for (const c of aplicables) {
    porEstadoDoc.set(c.docStatusARestaurar!, (porEstadoDoc.get(c.docStatusARestaurar!) ?? 0) + 1);
  }
  console.table([...porEstadoDoc.entries()].map(([estado, cantidad]) => ({ estado, cantidad })));

  console.log('--- Estados de participante a restaurar (solo los de restauración directa) ---');
  const porEstadoUser = new Map<string, number>();
  for (const c of conRestauracion) {
    const k = c.userStatusARestaurar ?? '(sin historial previo — no se toca)';
    porEstadoUser.set(k, (porEstadoUser.get(k) ?? 0) + 1);
  }
  console.table([...porEstadoUser.entries()].map(([estado, cantidad]) => ({ estado, cantidad })));

  console.log('\n--- Muestra de los primeros 10 cambios ---');
  aplicables.slice(0, 10).forEach((c) => {
    const accion = usaTerminarRevision(c)
      ? `participante: ${c.userStatusActual} → (lo recalcula TerminarRevision)`
      : `participante: ${c.userStatusActual} → ${c.userStatusARestaurar ?? '(no se toca)'}`;
    console.log(`   DNI ${c.dni} | ${c.nombre}`);
    console.log(`      documento: OBSERVADO → ${c.docStatusARestaurar}`);
    console.log(`      ${accion}`);
    console.log(`      se borra historial ${c.historialIaId} + su etiqueta${c.filaEstadoIaId ? ` + estado ${c.filaEstadoIaId}` : ''}`);
  });

  if (!APPLY) {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(
      `${LOG_DIR}/revert-ia-04.dry-run.json`,
      JSON.stringify({ total: todos.length, aplicables, excluidos }, null, 2),
      'utf8',
    );
    console.log(`\nDRY-RUN: no se escribió nada. Plan guardado en ${LOG_DIR}/revert-ia-04.dry-run.json`);
    console.log(`Para aplicar:  npx ts-node -r tsconfig-paths/register prisma/revert-ia-04-aplicar.ts --apply --esperado=${aplicables.length}`);
    return;
  }

  if (ESPERADO && ESPERADO !== aplicables.length) {
    console.error(
      `\n✘ ABORTADO: se esperaban ${ESPERADO} filas a revertir y el recálculo en vivo dio ${aplicables.length}.\n` +
        '  Algo cambió en la base desde el dry-run. Volvé a correr el dry-run y revisá las diferencias.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('\n=== APLICANDO ===\n');

  const revertidos: Record<string, unknown>[] = [];
  const omitidos: Record<string, unknown>[] = [];

  for (let i = 0; i < aplicables.length; i += TAMANO_LOTE) {
    const lote = aplicables.slice(i, i + TAMANO_LOTE);
    const numeroLote = Math.floor(i / TAMANO_LOTE) + 1;
    const totalLotes = Math.ceil(aplicables.length / TAMANO_LOTE);

    await prisma.$transaction(async (tx) => {
      for (const c of lote) {
        // Se lee la fila completa antes de borrarla: el log tiene que permitir reconstruirla.
        const historial = await tx.userDocumentHistory.findUnique({ where: { id: c.historialIaId } });
        if (!historial || historial.status !== 'OBSERVADO') {
          omitidos.push({ dni: c.dni, motivo: 'el historial de la IA ya no existe o cambió' });
          continue;
        }

        const etiquetas = await tx.userDocumentHistoryEtiquetas.findMany({
          where: { userDocumentHistoryId: c.historialIaId },
        });
        const filaEstado = c.filaEstadoIaId
          ? await tx.userHistoryStatus.findUnique({ where: { id: c.filaEstadoIaId } })
          : null;

        // 1. Etiquetas del historial de la IA
        await tx.userDocumentHistoryEtiquetas.deleteMany({
          where: { userDocumentHistoryId: c.historialIaId },
        });

        // 2. El historial de la IA
        await tx.userDocumentHistory.delete({ where: { id: c.historialIaId } });

        // 3. Status del documento — solo si sigue en OBSERVADO
        const doc = await tx.userDocuments.updateMany({
          where: { id: c.userDocumentId, status: 'OBSERVADO' },
          data: { status: c.docStatusARestaurar as never },
        });
        if (doc.count !== 1) {
          throw new Error(
            `El documento ${c.userDocumentId} (DNI ${c.dni}) ya no estaba en OBSERVADO. Se aborta el lote ${numeroLote}.`,
          );
        }

        // 4. La fila de UserHistoryStatus que creó la corrida
        if (c.filaEstadoIaId) {
          await tx.userHistoryStatus.deleteMany({ where: { id: c.filaEstadoIaId } });
        }

        // 5. Estado del participante — solo restauración directa; los bloqueados van después
        let estadoEscrito: string | null = null;
        if (!usaTerminarRevision(c) && c.userStatusARestaurar) {
          await tx.user.update({
            where: { id: c.userId },
            data: { status: c.userStatusARestaurar as never },
          });
          estadoEscrito = c.userStatusARestaurar;
        }

        revertidos.push({
          dni: c.dni,
          nombre: c.nombre,
          userId: c.userId,
          userDocumentId: c.userDocumentId,
          documentoDe: 'OBSERVADO',
          documentoA: c.docStatusARestaurar,
          participanteDe: c.userStatusActual,
          participanteA: estadoEscrito ?? '(pendiente de TerminarRevision)',
          historialBorrado: historial,
          etiquetasBorradas: etiquetas,
          filaEstadoBorrada: filaEstado,
        });
      }
    });

    console.log(`Lote ${numeroLote}/${totalLotes} aplicado (${lote.length} filas).`);
  }

  console.log(`\nRevertidos: ${revertidos.length} | Omitidos: ${omitidos.length}`);

  // TerminarRevisionUseCase para los participantes en estado bloqueado al sync.
  const terminados: Record<string, unknown>[] = [];
  if (conTerminar.length) {
    console.log(`\n=== TerminarRevisionUseCase para ${conTerminar.length} participantes (sin correos) ===`);
    const app = await NestFactory.createApplicationContext(UserDocumentsModule, {
      logger: ['error', 'warn'],
    });
    const terminarRevision = app.get(TerminarRevisionUseCase);

    for (const c of conTerminar) {
      try {
        await terminarRevision.execute(c.userId, AUTOR_CORRIDA, true);
        const despues = await prisma.user.findUnique({
          where: { id: c.userId },
          select: { status: true },
        });
        terminados.push({
          dni: c.dni,
          de: c.userStatusActual,
          a: String(despues?.status ?? '?'),
        });
        console.log(`   DNI ${c.dni}: ${c.userStatusActual} → ${String(despues?.status ?? '?')}`);
      } catch (err) {
        terminados.push({
          dni: c.dni,
          de: c.userStatusActual,
          a: 'ERROR',
          error: err instanceof Error ? err.message : 'desconocido',
        });
        console.error(`   ✘ DNI ${c.dni}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    await app.close();
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}/revert-ia-04-aplicado.json`;
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        base: `${process.env.DATABASE_DB}@${process.env.HOST_DB}`,
        totalCorrida: todos.length,
        revertidos: revertidos.length,
        omitidos,
        terminarRevision: terminados,
        detalle: revertidos,
        nota:
          'historialBorrado / etiquetasBorradas / filaEstadoBorrada contienen las filas completas ' +
          'tal como estaban antes de borrarlas: alcanzan para reinsertarlas sin recurrir al backup.',
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nLog completo en ${logPath}`);
}

main()
  .catch((e) => {
    console.error('\n✘ ERROR:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // El contexto de Nest deja handles abiertos (pool de Prisma del módulo) y el proceso no termina
    // solo: en la corrida del 5/8 quedó colgado DESPUÉS de completar todo el trabajo y escribir el
    // log, y hubo que matarlo. Se fuerza la salida para que el código de salida sea fiable.
    process.exit(process.exitCode ?? 0);
  });
