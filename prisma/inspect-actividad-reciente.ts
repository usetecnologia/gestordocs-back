import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA: qué pasó en el sistema desde la corrida IA del 4/8.
 *
 * Motivo: al recalcular el inventario de la reversión el 5/8 por la tarde, los conflictos saltaron
 * de 9 a 201 y apareció una observación IA nueva con un segundo autor. Antes de revertir nada hay
 * que entender qué movió esos estados.
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
  console.log('=== Observaciones con etiqueta "Observado por IA", por día y autor ===');
  console.table(
    porDiaAutor.map((r) => ({
      dia: String(r.dia).slice(0, 10),
      autor: r.autor,
      total: n(r.total),
      primero: r.primero.toISOString().slice(11, 19),
      ultimo: r.ultimo.toISOString().slice(11, 19),
    })),
  );

  const cambiosHoy = await prisma.$queryRaw<
    { hora: string; autor: string | null; estado: string; total: bigint }[]
  >`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS hora,
           created_by_id AS autor, status AS estado, COUNT(*) AS total
    FROM UserHistoryStatus
    WHERE created_at >= '2026-08-05 00:00:00'
    GROUP BY hora, created_by_id, status
    HAVING total > 3
    ORDER BY hora
  `;
  console.log('\n=== Cambios de estado de participantes HOY, agrupados por minuto (solo ráfagas > 3) ===');
  console.table(
    cambiosHoy.map((r) => ({ minuto: r.hora, autor: r.autor, estado: r.estado, total: n(r.total) })),
  );

  const totalHoy = await prisma.$queryRaw<{ total: bigint; autores: string }[]>`
    SELECT COUNT(*) AS total, GROUP_CONCAT(DISTINCT created_by_id) AS autores
    FROM UserHistoryStatus
    WHERE created_at >= '2026-08-05 00:00:00'
  `;
  console.log('\nTotal de cambios de estado hoy:', n(totalHoy[0]?.total), '| autores:', totalHoy[0]?.autores);

  const historialesHoy = await prisma.$queryRaw<
    { hora: string; autor: string | null; estado: string; total: bigint }[]
  >`
    SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS hora,
           created_by_id AS autor, status AS estado, COUNT(*) AS total
    FROM UserDocumentHistory
    WHERE created_at >= '2026-08-05 00:00:00'
    GROUP BY hora, created_by_id, status
    HAVING total > 3
    ORDER BY hora
  `;
  console.log('\n=== Historiales de documentos creados HOY, por minuto (ráfagas > 3) ===');
  console.table(
    historialesHoy.map((r) => ({ minuto: r.hora, autor: r.autor, estado: r.estado, total: n(r.total) })),
  );

  const totalHistHoy = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM UserDocumentHistory WHERE created_at >= '2026-08-05 00:00:00'
  `;
  console.log('\nTotal de historiales de documento creados hoy:', n(totalHistHoy[0]?.total));

  const nuevaIA = await prisma.$queryRaw<
    { id: string; dni: string | null; autor: string | null; createdAt: Date; observation: string | null }[]
  >`
    SELECT h.id, p.dni, h.created_by_id AS autor, h.created_at AS createdAt, h.observation
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    LEFT JOIN Person p         ON p.id = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA} AND h.created_at >= '2026-08-05 00:00:00'
    ORDER BY h.created_at
  `;
  console.log('\n=== Observaciones con etiqueta IA creadas HOY ===');
  nuevaIA.forEach((r) =>
    console.log(
      `   ${r.createdAt.toISOString()} | DNI ${r.dni ?? 's/d'} | autor ${r.autor}\n      ${(r.observation ?? '').slice(0, 160)}`,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
