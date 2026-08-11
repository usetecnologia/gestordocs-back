import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** Inspección SOLO LECTURA: tipo real de columnas y alcance de la corrida de revisión IA. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';

async function main() {
  const cols = await prisma.$queryRaw<
    { TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; CHARACTER_MAXIMUM_LENGTH: bigint | null }[]
  >`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'UserDocumentHistory'
      AND COLUMN_NAME IN ('observation', 'url')
  `;
  console.log('=== Tipo real de columnas en producción ===');
  console.table(cols.map((c) => ({ ...c, CHARACTER_MAXIMUM_LENGTH: Number(c.CHARACTER_MAXIMUM_LENGTH ?? 0) })));

  const porDia = await prisma.$queryRaw<{ dia: string; historiales: bigint; usuarios: bigint }[]>`
    SELECT DATE(h.created_at) AS dia,
           COUNT(*) AS historiales,
           COUNT(DISTINCT ud.userId) AS usuarios
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud ON ud.id = h.userDocumentsId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
    GROUP BY DATE(h.created_at)
    ORDER BY dia
  `;
  console.log('\n=== Historiales con etiqueta "Observado por IA", por día ===');
  console.table(porDia.map((r) => ({ dia: String(r.dia), historiales: Number(r.historiales), usuarios: Number(r.usuarios) })));

  const ventana = await prisma.$queryRaw<{ primero: Date; ultimo: Date; total: bigint; creadores: string }[]>`
    SELECT MIN(h.created_at) AS primero, MAX(h.created_at) AS ultimo, COUNT(*) AS total,
           GROUP_CONCAT(DISTINCT h.created_by_id) AS creadores
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND DATE(h.created_at) = CURDATE()
  `;
  console.log('\n=== Ventana de la corrida de HOY ===');
  console.log(ventana.map((v) => ({ ...v, total: Number(v.total) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
