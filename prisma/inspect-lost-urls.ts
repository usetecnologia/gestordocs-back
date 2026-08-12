import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA: alcance real del bug del fix 1 (pérdida de la URL del archivo).
 *
 * Filtro preciso (el que pide §4.5 del documento del incidente): historiales con `url IS NULL`
 * **cuyo documento sí tenía una URL en un historial anterior**. Sin ese cruce, contar "REVISADO con
 * url NULL" mezcla los casos del bug con documentos que legítimamente nunca tuvieron archivo (p. ej.
 * HISTORICO), y el número queda inflado.
 *
 * Distingue dos cosas:
 *   (A) historiales huérfanos  → cuántas veces ocurrió el bug en total (histórico)
 *   (B) documentos ROTOS AHORA → aquellos cuyo ÚLTIMO historial no tiene URL habiéndola tenido
 *       antes. Solo estos se ven mal en la aplicación: son los que hay que reparar.
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const n = (v: bigint | number | null) => Number(v ?? 0);

interface BrokenRow {
  dni: string | null;
  documento: string | null;
  userDocumentId: string;
  historyId: string;
  histStatus: string;
  docStatus: string;
  statusDocument: number;
  createdAt: Date;
  urlPrevia: string;
}

async function main() {
  // (A) Todas las veces que se perdió una URL, por día y status del historial.
  const huerfanosPorDia = await prisma.$queryRaw<
    { dia: string; histStatus: string; total: bigint }[]
  >`
    SELECT DATE(t.created_at) AS dia, t.status AS histStatus, COUNT(*) AS total
    FROM (
      SELECT h.id, h.status, h.created_at,
             (SELECT h2.url FROM UserDocumentHistory h2
               WHERE h2.userDocumentsId = h.userDocumentsId
                 AND h2.url IS NOT NULL
                 AND h2.created_at < h.created_at
               ORDER BY h2.created_at DESC LIMIT 1) AS urlPrevia
      FROM UserDocumentHistory h
      WHERE h.url IS NULL
    ) t
    WHERE t.urlPrevia IS NOT NULL
    GROUP BY DATE(t.created_at), t.status
    ORDER BY dia DESC, histStatus
  `;

  const totalHuerfanos = huerfanosPorDia.reduce((acc, r) => acc + n(r.total), 0);
  console.log('=== (A) Historiales que perdieron la URL (bug del fix 1), por día ===');
  console.log(`Total histórico: ${totalHuerfanos}\n`);
  console.table(
    huerfanosPorDia.map((r) => ({
      dia: String(r.dia).slice(0, 10),
      histStatus: r.histStatus,
      total: n(r.total),
    })),
  );

  // (B) Documentos cuyo ÚLTIMO historial no tiene URL habiéndola tenido: los que están roto ahora.
  const roto = await prisma.$queryRaw<BrokenRow[]>`
    SELECT * FROM (
      SELECT p.dni                AS dni,
             d.name               AS documento,
             ud.id                AS userDocumentId,
             ud.status            AS docStatus,
             ud.status_document   AS statusDocument,
             h.id                 AS historyId,
             h.status             AS histStatus,
             h.created_at         AS createdAt,
             (SELECT h2.url FROM UserDocumentHistory h2
               WHERE h2.userDocumentsId = ud.id
                 AND h2.url IS NOT NULL
                 AND h2.created_at < h.created_at
               ORDER BY h2.created_at DESC LIMIT 1) AS urlPrevia
      FROM UserDocuments ud
      JOIN UserDocumentHistory h
        ON h.id = (SELECT h3.id FROM UserDocumentHistory h3
                    WHERE h3.userDocumentsId = ud.id
                    ORDER BY h3.created_at DESC, h3.id DESC LIMIT 1)
      LEFT JOIN Person p    ON p.id = ud.userId
      LEFT JOIN documents d ON d.id = ud.documentId
      WHERE h.url IS NULL
    ) t
    WHERE t.urlPrevia IS NOT NULL
    ORDER BY t.createdAt
  `;

  console.log(`\n=== (B) Documentos ROTOS AHORA (último historial sin URL, recuperable): ${roto.length} ===\n`);

  const activos = roto.filter((r) => Number(r.statusDocument) === 1);
  const inactivos = roto.filter((r) => Number(r.statusDocument) !== 1);
  console.log(`Activos (statusDocument = true):   ${activos.length}   ← los que se ven en la app`);
  console.log(`Inactivos (statusDocument = false): ${inactivos.length}`);

  const porDocumento = new Map<string, number>();
  const porStatus = new Map<string, number>();
  for (const r of activos) {
    const doc = r.documento ?? '(sin nombre)';
    porDocumento.set(doc, (porDocumento.get(doc) ?? 0) + 1);
    porStatus.set(r.histStatus, (porStatus.get(r.histStatus) ?? 0) + 1);
  }

  console.log('\n--- Activos por tipo de documento ---');
  console.table(
    [...porDocumento.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([documento, cantidad]) => ({ documento, cantidad })),
  );

  console.log('--- Activos por status del último historial ---');
  console.table([...porStatus.entries()].map(([status, cantidad]) => ({ status, cantidad })));

  console.log('\n--- Detalle de los activos ---');
  console.table(
    activos.map((r) => ({
      dni: r.dni ?? '',
      documento: r.documento ?? '',
      histStatus: r.histStatus,
      docStatus: r.docStatus,
      fecha: r.createdAt.toISOString().slice(0, 16).replace('T', ' '),
      urlPrevia: r.urlPrevia.split('/').pop() ?? '',
    })),
  );

  console.log('\n--- IDs para la reparación (historyId → url a restaurar) ---');
  for (const r of activos) {
    console.log(`${r.historyId}  ${r.urlPrevia}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
