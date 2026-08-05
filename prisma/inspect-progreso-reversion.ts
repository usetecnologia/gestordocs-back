import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** Inspección SOLO LECTURA: cuántas observaciones de la corrida quedan sin revertir. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const [row] = await prisma.$queryRaw<{ restantes: bigint }[]>`
    SELECT COUNT(*) AS restantes
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    WHERE e.etiquetaId = '6de02d0d-a5ef-40c7-8488-7cf604a16d43'
      AND h.created_by_id = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d'
      AND h.created_at BETWEEN '2026-08-04 17:49:00' AND '2026-08-04 21:47:00'
  `;
  const restantes = Number(row?.restantes ?? 0);
  const revertidas = 245 - restantes;
  console.log(`Observaciones de la corrida que quedan: ${restantes} de 245`);
  console.log(`Revertidas hasta ahora:                 ${revertidas}`);
  console.log(`(al terminar deberían quedar 15: los excluidos)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
