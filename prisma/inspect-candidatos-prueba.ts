import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA: candidatos a "registro de prueba" entre los afectados por la corrida IA.
 * Sirve para fijar con precisión a quién se excluye de la reversión — excluir a un participante real
 * lo dejaría observado por error.
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.$queryRaw<
    {
      dni: string | null;
      nombre: string;
      email: string | null;
      status: string;
      documentos: bigint;
      creado: Date | null;
    }[]
  >`
    SELECT p.dni,
           CONCAT_WS(' ', p.firstname, p.middlename, p.lastfathername, p.lastmothername) AS nombre,
           u.email, u.status,
           (SELECT COUNT(*) FROM UserDocuments x WHERE x.userId = p.id) AS documentos,
           u.created_at AS creado
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    JOIN Person p              ON p.id = ud.userId
    LEFT JOIN User u           ON u.id = ud.userId
    WHERE e.etiquetaId = '6de02d0d-a5ef-40c7-8488-7cf604a16d43'
      AND h.created_by_id = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d'
      AND h.created_at BETWEEN '2026-08-04 17:49:00' AND '2026-08-04 21:47:00'
      AND (
        p.dni REGEXP '^(1234|0000|1111|9999)'
        OR p.dni NOT REGEXP '^[0-9]{8}$'
        OR LOWER(CONCAT_WS(' ', p.firstname, p.middlename, p.lastfathername, p.lastmothername))
             REGEXP '(test|prueba|dev|demo|[[:<:]]qa[[:>:]])'
        OR LOWER(COALESCE(u.email, '')) REGEXP '(test|prueba|demo|example)'
      )
    ORDER BY p.dni
  `;

  console.log('=== Candidatos a registro de prueba entre los 245 afectados ===\n');
  console.table(
    rows.map((r) => ({
      dni: r.dni,
      nombre: r.nombre,
      email: r.email ?? '',
      estado: r.status,
      docs: Number(r.documentos),
      creado: r.creado?.toISOString().slice(0, 10) ?? '',
    })),
  );
  console.log(`Total candidatos: ${rows.length}`);
  console.log(
    '\nCriterio: DNI que no son 8 dígitos, DNI que empiezan por 1234/0000/1111/9999,\n' +
      'o nombre/email que contienen test, prueba, dev, demo o qa.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
