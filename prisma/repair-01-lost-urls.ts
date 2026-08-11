import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { detectFileType } from '@common/utils/file-type.util';

/**
 * REPARACIÓN — restaura la URL perdida por el bug del fix 1 (documento del incidente, §4.4 a).
 *
 * Qué arregla: los documentos cuyo ÚLTIMO historial quedó con `url = NULL` aunque el archivo sigue
 * en S3, porque "aceptar" u "observar" buscaban la URL en el último historial con status `SUBIDO` y
 * los documentos de carga masiva nunca tienen uno. El archivo nunca se perdió: se perdió la
 * referencia, y en la aplicación el documento se ve sin archivo.
 *
 *   Dry-run (por defecto):  npx ts-node -r tsconfig-paths/register prisma/repair-01-lost-urls.ts
 *   Aplicar:                npx ts-node -r tsconfig-paths/register prisma/repair-01-lost-urls.ts --apply
 *
 * Garantías:
 *   - Recalcula el conjunto EN VIVO en cada corrida: nunca trabaja sobre una lista fija.
 *   - Solo escribe la columna `url` de historiales que hoy la tienen en NULL. Nada más se toca:
 *     ni el status del documento, ni el del participante, ni ninguna fila se borra o crea.
 *   - Verifica en S3 que el archivo exista ANTES de escribir su URL (una URL que apunta a la nada
 *     no arregla nada). Las que no se pueden verificar se omiten y se listan aparte.
 *   - Cada UPDATE va por su propio id y se comprueba que siga en NULL en el momento de escribir.
 *   - Deja un log en disco con el antes/después de cada fila, para auditoría y para revertir.
 *
 * Revertir es trivial: todas las filas tenían NULL, así que
 * `UPDATE UserDocumentHistory SET url = NULL WHERE id IN (...)` con los ids del log deshace todo.
 */

const APPLY = process.argv.includes('--apply');
const LOG_DIR = 'reparacion-datos';
const HEAD_TIMEOUT_MS = 20_000;
const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

interface BrokenRow {
  dni: string | null;
  documento: string | null;
  userDocumentId: string;
  historyId: string;
  histStatus: string;
  docStatus: string;
  createdAt: Date;
  urlPrevia: string;
}

interface FileCheck {
  ok: boolean;
  status: number | null;
  declaredContentType: string | null;
  realContentType: string | null;
  detail: string;
}

/** Documentos cuyo último historial perdió la URL y es recuperable de un historial anterior. */
async function findBrokenDocuments(): Promise<BrokenRow[]> {
  return prisma.$queryRaw<BrokenRow[]>`
    SELECT * FROM (
      SELECT p.dni              AS dni,
             d.name             AS documento,
             ud.id              AS userDocumentId,
             ud.status          AS docStatus,
             h.id               AS historyId,
             h.status           AS histStatus,
             h.created_at       AS createdAt,
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
        AND ud.status_document = 1
    ) t
    WHERE t.urlPrevia IS NOT NULL
    ORDER BY t.createdAt
  `;
}

/**
 * Comprueba que el archivo exista realmente en S3. Se piden los primeros bytes (Range) en vez de un
 * HEAD para poder verificar además el tipo real del contenido: varios de estos archivos arrastran el
 * bug del fix 2 y están guardados con un Content-Type que no les corresponde.
 */
async function checkFile(url: string): Promise<FileCheck> {
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-15' },
      signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
    });

    if (!response.ok && response.status !== 206) {
      return {
        ok: false,
        status: response.status,
        declaredContentType: null,
        realContentType: null,
        detail: `HTTP ${response.status}`,
      };
    }

    const declared = response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const real = detectFileType(bytes)?.contentType ?? null;

    return {
      ok: true,
      status: response.status,
      declaredContentType: declared,
      realContentType: real,
      detail: 'archivo presente',
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      declaredContentType: null,
      realContentType: null,
      detail: err instanceof Error ? err.message : 'error desconocido',
    };
  }
}

async function main() {
  console.log(APPLY ? '=== MODO APPLY — se escribirá en la base ===' : '=== DRY-RUN — no se escribe nada ===');
  console.log(`Base: ${process.env.DATABASE_DB} @ ${process.env.HOST_DB}:${process.env.PORT_DB}\n`);

  const roto = await findBrokenDocuments();
  if (!roto.length) {
    console.log('No hay documentos con la URL perdida. Nada que reparar.');
    return;
  }

  console.log(`Documentos con la URL perdida (recalculado en vivo): ${roto.length}\n`);

  const checks = new Map<string, FileCheck>();
  for (const row of roto) {
    checks.set(row.historyId, await checkFile(row.urlPrevia));
  }

  // Si alguno de estos historiales lo escribió la revisión IA, la reversión pendiente lo va a
  // borrar y repararlo sería trabajo en vano: se avisa para tratarlo aparte.
  const conEtiquetaIA = new Set(
    (
      await prisma.userDocumentHistoryEtiquetas.findMany({
        where: {
          userDocumentHistoryId: { in: roto.map((r) => r.historyId) },
          etiquetaId: ETIQUETA_IA,
        },
        select: { userDocumentHistoryId: true },
      })
    ).map((r) => r.userDocumentHistoryId),
  );

  const reparables = roto.filter((r) => checks.get(r.historyId)!.ok);
  const omitidos = roto.filter((r) => !checks.get(r.historyId)!.ok);

  console.log('--- Plan de reparación ---');
  for (const row of roto) {
    const check = checks.get(row.historyId)!;
    const tipo =
      check.declaredContentType && check.realContentType && check.declaredContentType !== check.realContentType
        ? `  ⚠ S3 declara ${check.declaredContentType} pero es ${check.realContentType}`
        : '';
    console.log(
      `${check.ok ? '✔' : '✘'} DNI ${row.dni ?? 's/d'} | ${row.documento ?? '(documento sin nombre)'} | ` +
        `${row.histStatus} | ${row.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
    );
    console.log(`    history ${row.historyId}`);
    console.log(`    url: NULL  →  ${row.urlPrevia}`);
    console.log(`    archivo en S3: ${check.detail}${tipo}`);
    if (conEtiquetaIA.has(row.historyId)) {
      console.log('    ⚠ ESTE HISTORIAL LO ESCRIBIÓ LA REVISIÓN IA: la reversión pendiente lo borrará.');
    }
  }

  console.log(`\nReparables: ${reparables.length}`);
  if (omitidos.length) {
    console.log(`Omitidos (el archivo no se pudo verificar en S3): ${omitidos.length}`);
    omitidos.forEach((o) =>
      console.log(`   DNI ${o.dni ?? 's/d'} — ${checks.get(o.historyId)!.detail}`),
    );
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.');
    return;
  }

  const aplicados: Record<string, unknown>[] = [];
  const fallidos: Record<string, unknown>[] = [];

  for (const row of reparables) {
    try {
      // La condición `url: null` es la salvaguarda: si algo escribió una URL entre el recálculo y
      // este momento, el update no afecta ninguna fila y no se pisa nada.
      const result = await prisma.userDocumentHistory.updateMany({
        where: { id: row.historyId, url: null },
        data: { url: row.urlPrevia },
      });

      if (result.count === 1) {
        aplicados.push({
          historyId: row.historyId,
          userDocumentId: row.userDocumentId,
          dni: row.dni,
          urlAnterior: null,
          urlNueva: row.urlPrevia,
        });
        console.log(`✔ Reparado DNI ${row.dni ?? 's/d'} (history ${row.historyId})`);
      } else {
        fallidos.push({ historyId: row.historyId, dni: row.dni, motivo: 'la fila ya no tenía url NULL' });
        console.log(`⚠ Omitido DNI ${row.dni ?? 's/d'}: la fila ya no tenía url NULL`);
      }
    } catch (err) {
      fallidos.push({
        historyId: row.historyId,
        dni: row.dni,
        motivo: err instanceof Error ? err.message : 'error desconocido',
      });
      console.error(`✘ Error reparando DNI ${row.dni ?? 's/d'}:`, err);
    }
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}/repair-01-lost-urls.json`;
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        base: `${process.env.DATABASE_DB}@${process.env.HOST_DB}`,
        totalDetectados: roto.length,
        aplicados,
        fallidos,
        omitidosPorS3: omitidos.map((o) => ({
          historyId: o.historyId,
          dni: o.dni,
          url: o.urlPrevia,
          detalle: checks.get(o.historyId)!.detail,
        })),
        revertir: `UPDATE UserDocumentHistory SET url = NULL WHERE id IN (${aplicados
          .map((a) => `'${String(a.historyId)}'`)
          .join(', ')});`,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nAplicados: ${aplicados.length} | Fallidos: ${fallidos.length}`);
  console.log(`Log escrito en ${logPath} (incluye el SQL para revertir).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
