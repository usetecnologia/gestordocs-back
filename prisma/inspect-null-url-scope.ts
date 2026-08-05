import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** SOLO LECTURA: documentos que quedaron sin URL tras un "aceptar" posterior a la observación IA. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const sinUrlHoy = await prisma.$queryRaw<{ total: bigint; usuarios: bigint }[]>`
    SELECT COUNT(*) AS total, COUNT(DISTINCT ud.userId) AS usuarios
    FROM UserDocumentHistory h
    JOIN UserDocuments ud ON ud.id = h.userDocumentsId
    WHERE h.status = 'REVISADO' AND h.url IS NULL AND DATE(h.created_at) = CURDATE()
  `;
  console.log('=== Historiales REVISADO con url NULL creados HOY ===');
  console.log(sinUrlHoy.map((r) => ({ total: Number(r.total), usuarios: Number(r.usuarios) })));

  const detalle = await prisma.$queryRaw<
    { dni: string | null; userDocumentId: string; createdAt: Date; urlPrevia: string | null }[]
  >`
    SELECT p.dni AS dni,
           ud.id AS userDocumentId,
           h.created_at AS createdAt,
           (SELECT h2.url FROM UserDocumentHistory h2
             WHERE h2.userDocumentsId = ud.id AND h2.url IS NOT NULL AND h2.created_at < h.created_at
             ORDER BY h2.created_at DESC LIMIT 1) AS urlPrevia
    FROM UserDocumentHistory h
    JOIN UserDocuments ud ON ud.id = h.userDocumentsId
    LEFT JOIN Person p ON p.id = ud.userId
    WHERE h.status = 'REVISADO' AND h.url IS NULL AND DATE(h.created_at) = CURDATE()
    ORDER BY h.created_at
  `;
  console.log(`\n=== Detalle (${detalle.length}) — primeros 15 ===`);
  detalle.slice(0, 15).forEach((d) =>
    console.log(
      `   dni=${d.dni} doc=${d.userDocumentId} ${d.createdAt.toISOString()} urlPrevia=${d.urlPrevia ? '✔ recuperable' : '✘ NO hay'}`,
    ),
  );
  console.log('\nCon url previa recuperable:', detalle.filter((d) => d.urlPrevia).length);
  console.log('Sin url previa:', detalle.filter((d) => !d.urlPrevia).length);

  const historico = await prisma.$queryRaw<{ dia: string; total: bigint }[]>`
    SELECT DATE(h.created_at) AS dia, COUNT(*) AS total
    FROM UserDocumentHistory h
    WHERE h.status = 'REVISADO' AND h.url IS NULL
    GROUP BY DATE(h.created_at) ORDER BY dia DESC LIMIT 15
  `;
  console.log('\n=== Historial del mismo problema (REVISADO sin url), por día ===');
  console.table(historico.map((r) => ({ dia: String(r.dia).slice(0, 15), total: Number(r.total) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
