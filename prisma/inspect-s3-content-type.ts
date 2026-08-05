import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** Inspección SOLO LECTURA: cuántos archivos habría que verificar en el barrido de Content-Type. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const n = (v: bigint | number | null) => Number(v ?? 0);

async function main() {
  // El bug del Content-Type entró con el commit 458d146 del 1/7/2026 18:01 (hora local, UTC-5).
  // Se usa un margen amplio hacia atrás para no dejar casos afuera.
  const desde = '2026-07-01 00:00:00';

  const totales = await prisma.$queryRaw<
    { urls_distintas: bigint; historiales: bigint; primera: Date | null; ultima: Date | null }[]
  >`
    SELECT COUNT(DISTINCT h.url) AS urls_distintas,
           COUNT(*)              AS historiales,
           MIN(h.created_at)     AS primera,
           MAX(h.created_at)     AS ultima
    FROM UserDocumentHistory h
    WHERE h.url IS NOT NULL AND h.created_at >= ${desde}
  `;
  console.log(`=== URLs de documentos registradas desde ${desde} ===`);
  console.table(
    totales.map((t) => ({
      urls_distintas: n(t.urls_distintas),
      historiales: n(t.historiales),
      primera: t.primera?.toISOString().slice(0, 16),
      ultima: t.ultima?.toISOString().slice(0, 16),
    })),
  );

  const historico = await prisma.$queryRaw<{ urls_distintas: bigint }[]>`
    SELECT COUNT(DISTINCT h.url) AS urls_distintas
    FROM UserDocumentHistory h
    WHERE h.url IS NOT NULL
  `;
  console.log(`URLs distintas en toda la tabla (sin filtro de fecha): ${n(historico[0]?.urls_distintas)}`);

  const porExtension = await prisma.$queryRaw<{ ext: string; total: bigint }[]>`
    SELECT LOWER(SUBSTRING_INDEX(h.url, '.', -1)) AS ext, COUNT(DISTINCT h.url) AS total
    FROM UserDocumentHistory h
    WHERE h.url IS NOT NULL AND h.created_at >= ${desde}
    GROUP BY ext
    ORDER BY total DESC
  `;
  console.log('\n--- Por extensión de la key (lo que S3 usó para deducir el Content-Type) ---');
  console.table(porExtension.map((r) => ({ ext: r.ext, urls: n(r.total) })));

  // Los archivos de observación también se suben por el mismo servicio.
  const observacion = await prisma.$queryRaw<{ tabla: string; total: bigint }[]>`
    SELECT 'UserDocumentObservationFiles' AS tabla, COUNT(DISTINCT file) AS total
    FROM UserDocumentObservationFiles
    UNION ALL
    SELECT 'UserObservationFiles' AS tabla, COUNT(DISTINCT file) AS total
    FROM UserObservationFiles
  `;
  console.log('--- Otros archivos subidos por el mismo servicio ---');
  console.table(observacion.map((r) => ({ tabla: r.tabla, archivos: n(r.total) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
