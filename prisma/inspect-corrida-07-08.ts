import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA — identifica la corrida de `revision-masiva-pasaporte` del viernes
 * 7/8/2026 por la noche (segundo incidente del mismo API; el primero fue el 4/8 y ya se revirtió,
 * ver docs/PENDIENTE-reversion-observaciones-ia.md).
 *
 * No se puede filtrar solo por la etiqueta IA: quedan filas del 4/8 (los 15 excluidos de esa
 * reversión) y al menos una observación manual hecha con esa etiqueta. Este script establece la
 * firma real de la corrida nueva (día + autor + ventana) antes de inventariar nada.
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/inspect-corrida-07-08.ts
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';
const n = (v: bigint | number | null) => Number(v ?? 0);

async function main() {
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
  console.log('SOLO LECTURA — este script no escribe ninguna fila.\n');

  const porDiaAutor = await prisma.$queryRaw<
    { dia: string; autor: string | null; total: bigint; primero: Date; ultimo: Date }[]
  >`
    SELECT DATE(h.created_at) AS dia, h.created_by_id AS autor, COUNT(*) AS total,
           MIN(h.created_at) AS primero, MAX(h.created_at) AS ultimo
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
    GROUP BY DATE(h.created_at), h.created_by_id
    ORDER BY dia, primero
  `;
  console.log('=== Historiales con etiqueta "Observado por IA" — por día y autor (TODA la historia) ===');
  console.table(
    porDiaAutor.map((r) => ({
      dia: String(r.dia).slice(0, 10),
      autor: r.autor,
      total: n(r.total),
      primero: r.primero.toISOString(),
      ultimo: r.ultimo.toISOString(),
    })),
  );

  // Historiales OBSERVADO creados desde el jueves, con y sin etiqueta: si la corrida nueva no
  // etiquetó (o la etiqueta cambió), igual aparece acá.
  const observadosRecientes = await prisma.$queryRaw<
    { dia: string; autor: string | null; conEtiqueta: bigint; total: bigint; primero: Date; ultimo: Date }[]
  >`
    SELECT DATE(h.created_at) AS dia, h.created_by_id AS autor,
           SUM(CASE WHEN e.etiquetaId = ${ETIQUETA_IA} THEN 1 ELSE 0 END) AS conEtiqueta,
           COUNT(DISTINCT h.id) AS total,
           MIN(h.created_at) AS primero, MAX(h.created_at) AS ultimo
    FROM UserDocumentHistory h
    LEFT JOIN UserDocumentHistoryEtiquetas e ON e.userDocumentHistoryId = h.id
    WHERE h.created_at >= '2026-08-06 00:00:00' AND h.status = 'OBSERVADO'
    GROUP BY DATE(h.created_at), h.created_by_id
    ORDER BY dia, primero
  `;
  console.log('\n=== Historiales status=OBSERVADO desde el 6/8 — por día y autor ===');
  console.table(
    observadosRecientes.map((r) => ({
      dia: String(r.dia).slice(0, 10),
      autor: r.autor,
      total: n(r.total),
      conEtiquetaIA: n(r.conEtiqueta),
      primero: r.primero.toISOString(),
      ultimo: r.ultimo.toISOString(),
    })),
  );

  // Ráfagas de cambios de estado de participantes: separa la corrida del cron diario de las 07:00 UTC.
  const cambiosEstado = await prisma.$queryRaw<
    { hora: string; autor: string | null; estado: string; total: bigint }[]
  >`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H') AS hora,
           created_by_id AS autor, status AS estado, COUNT(*) AS total
    FROM UserHistoryStatus
    WHERE created_at >= '2026-08-06 00:00:00'
    GROUP BY hora, created_by_id, status
    HAVING total > 3
    ORDER BY hora
  `;
  console.log('\n=== Cambios de estado de participantes desde el 6/8, por hora (ráfagas > 3) ===');
  console.table(
    cambiosEstado.map((r) => ({ hora: r.hora, autor: r.autor, estado: r.estado, total: n(r.total) })),
  );

  // Correos: lo único irreversible. En el incidente del 4/8 no se envió ninguno porque la acción no
  // tenía plantilla — hay que reconfirmarlo para esta corrida, no darlo por hecho.
  const correos = await prisma.emailLog.groupBy({
    by: ['actionCode', 'status'],
    where: { sentAt: { gte: new Date('2026-08-06T00:00:00Z') } },
    _count: { _all: true },
    _min: { sentAt: true },
    _max: { sentAt: true },
  });
  console.log('\n=== historial_correos desde el 6/8 (por acción y estado) ===');
  console.table(
    correos.map((r) => ({
      accion: r.actionCode,
      estado: r.status,
      total: r._count._all,
      primero: r._min.sentAt?.toISOString(),
      ultimo: r._max.sentAt?.toISOString(),
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
