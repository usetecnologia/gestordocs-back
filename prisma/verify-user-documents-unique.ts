import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Verificación previa (solo lectura) de la migración 20260730120000_add_user_documents_active_unique.
 *
 * Reproduce la consolidación sin escribir nada y comprueba que, una vez aplicada, ningún grupo
 * quedaría con dos filas idénticas para los índices únicos — es decir, que el CREATE UNIQUE INDEX
 * no puede fallar.
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

interface DuplicadoRow {
  id: string;
  userId: string;
  target: string;
  status: string;
  historial: bigint;
  created_at: Date;
  updated_at: Date;
  rn: bigint;
}

const rankedQuery = (columna: 'documentSponsorId' | 'documentId') => `
  SELECT ud.id,
         ud.userId,
         ud.${columna} AS target,
         ud.status,
         ud.created_at,
         ud.updated_at,
         ranked.rn,
         (SELECT COUNT(*) FROM UserDocumentHistory h WHERE h.userDocumentsId = ud.id) AS historial
  FROM UserDocuments ud
  JOIN (
      SELECT id,
             ROW_NUMBER() OVER (
                 PARTITION BY userId, ${columna}
                 ORDER BY updated_at DESC, created_at DESC, id DESC
             ) AS rn,
             COUNT(*) OVER (PARTITION BY userId, ${columna}) AS total
      FROM UserDocuments
      WHERE ${columna} IS NOT NULL AND status_document = 1
  ) ranked ON ranked.id = ud.id
  WHERE ranked.total > 1
  ORDER BY ud.userId, target, ranked.rn
`;

async function revisar(columna: 'documentSponsorId' | 'documentId'): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<DuplicadoRow[]>(rankedQuery(columna));
  console.log(`\n=== Duplicados activos por ${columna}: ${rows.length} filas en conflicto ===`);
  for (const r of rows) {
    const accion = Number(r.rn) === 1 ? 'SE CONSERVA ACTIVO' : 'pasa a histórico';
    console.log(
      `  ${accion.padEnd(19)} ud=${r.id} user=${r.userId} target=${r.target} ` +
        `status=${r.status} historial=${r.historial} updated=${new Date(r.updated_at).toISOString()}`,
    );
  }
  return rows.filter((r) => Number(r.rn) > 1).length;
}

/**
 * Simula el estado resultante: tras la consolidación cada grupo tendría 1 fila activa y el resto
 * como histórico. El índice único solo puede fallar si un grupo terminara con dos filas históricas
 * (o dos activas), así que se cuentan ambos casos sobre el estado proyectado.
 */
async function verificarColisionesResultantes(
  columna: 'documentSponsorId' | 'documentId',
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ userId: string; target: string; n: bigint }[]>(`
    SELECT userId, target, COUNT(*) AS n
    FROM (
        SELECT userId,
               ${columna} AS target,
               CASE
                   WHEN status_document = 1
                        AND ROW_NUMBER() OVER (
                            PARTITION BY userId, ${columna}
                            ORDER BY (status_document = 1) DESC, updated_at DESC, created_at DESC, id DESC
                        ) = 1
                   THEN 1
                   ELSE 0
               END AS status_final
        FROM UserDocuments
        WHERE ${columna} IS NOT NULL
    ) proyectado
    GROUP BY userId, target, status_final
    HAVING COUNT(*) > 1
  `);

  if (rows.length) {
    console.log(`\n⚠ COLISIONES RESTANTES en ${columna} (${rows.length}) — el índice fallaría:`);
    for (const r of rows) {
      console.log(`   user=${r.userId} target=${r.target} filas=${r.n}`);
    }
  }
  return rows.length;
}

async function main() {
  const aDesactivarSponsor = await revisar('documentSponsorId');
  const aDesactivarDocumento = await revisar('documentId');

  const colisiones =
    (await verificarColisionesResultantes('documentSponsorId')) +
    (await verificarColisionesResultantes('documentId'));

  console.log('\n=== Resumen ===');
  console.log(`Filas que pasarían a histórico (sponsor): ${aDesactivarSponsor}`);
  console.log(`Filas que pasarían a histórico (global):  ${aDesactivarDocumento}`);
  console.log(`Filas eliminadas: 0`);
  console.log(
    colisiones === 0
      ? '\n✅ La migración puede aplicarse: ningún índice único quedaría en conflicto.'
      : `\n❌ NO aplicar: quedan ${colisiones} grupos en conflicto.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
