import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CopyObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { detectFileType, extensionFromFilename } from '@common/utils/file-type.util';

/**
 * REPARACIÓN — renombra los archivos cuya EXTENSIÓN no corresponde a su contenido real.
 *
 * Por qué hace falta, además de haber corregido ya el Content-Type (repair-02): el Content-Type solo
 * gobierna cómo responde S3. Cualquier consumidor que mire el nombre —un visor que hace
 * `url.endsWith('.pdf')`, o el sistema operativo cuando el participante descarga el archivo— sigue
 * equivocándose si un JPEG se llama ".pdf". Es el caso de la participante 70627745: archivo íntegro,
 * Content-Type ya correcto, y aun así el documento no se visualiza.
 *
 *   Dry-run (por defecto):  npx ts-node -r tsconfig-paths/register prisma/repair-03-file-extension.ts
 *   Un participante:        ... prisma/repair-03-file-extension.ts --dni=70627745
 *   Aplicar:                ... prisma/repair-03-file-extension.ts --dni=70627745 --apply
 *
 * Qué hace por cada archivo:
 *   1. Copia el objeto a una key nueva con la extensión correcta (mismo UUID, misma carpeta).
 *      El objeto original NO se borra: si algo quedara apuntando a la URL vieja, sigue sirviendo.
 *   2. Actualiza en la base TODAS las filas que referenciaban la URL vieja (el historial completo
 *      del documento, no solo la última), para que la app use la nueva.
 *
 * Es reversible: el objeto viejo sigue existiendo y el log guarda el SQL para restaurar las URLs.
 */

const APPLY = process.argv.includes('--apply');
const DNI = process.argv.find((a) => a.startsWith('--dni='))?.split('=')[1] ?? null;
const LIMITE = Number(process.argv.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? 0);
const LOG_DIR = 'reparacion-datos';
const REQUEST_TIMEOUT_MS = 30_000;
const CHECK_CONCURRENCY = 12;

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const BUCKET = process.env.AWS_S3_BUCKET!;
const REGION = process.env.AWS_REGION!;
const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/** Extensiones que designan el mismo formato: no hace falta renombrar entre ellas. */
const EQUIVALENTES: Record<string, string[]> = {
  jpg: ['jpg', 'jpeg', 'jfif', 'jpe'],
  jpeg: ['jpg', 'jpeg', 'jfif', 'jpe'],
  tiff: ['tif', 'tiff'],
  heic: ['heic', 'heif'],
};

interface Candidato {
  url: string;
  key: string;
  dni: string | null;
  extActual: string | null;
  extCorrecta: string;
  contentType: string;
  keyNueva: string;
  urlNueva: string;
  referencias: number;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function keyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.startsWith(`${BUCKET}.s3`)) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

/** URLs candidatas: las del participante indicado, o todas las registradas. */
async function findUrls(): Promise<{ url: string; dni: string | null }[]> {
  if (DNI) {
    return prisma.$queryRaw<{ url: string; dni: string | null }[]>`
      SELECT DISTINCT h.url AS url, p.dni AS dni
      FROM UserDocumentHistory h
      JOIN UserDocuments ud ON ud.id = h.userDocumentsId
      JOIN Person p         ON p.id = ud.userId
      WHERE h.url IS NOT NULL AND p.dni = ${DNI}
    `;
  }
  return prisma.$queryRaw<{ url: string; dni: string | null }[]>`
    SELECT DISTINCT h.url AS url, MIN(p.dni) AS dni
    FROM UserDocumentHistory h
    JOIN UserDocuments ud ON ud.id = h.userDocumentsId
    LEFT JOIN Person p    ON p.id = ud.userId
    WHERE h.url IS NOT NULL
    GROUP BY h.url
  `;
}

/** Lee los primeros bytes y decide si la extensión de la key corresponde al contenido. */
async function analizar(entry: { url: string; dni: string | null }): Promise<Candidato | null> {
  const key = keyFromUrl(entry.url);
  if (!key) return null;

  try {
    let response = await fetch(entry.url, {
      headers: { Range: 'bytes=0-31' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 416) {
      response = await fetch(entry.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    }
    if (!response.ok && response.status !== 206) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    const detected = detectFileType(bytes);
    if (!detected) return null;

    const extActual = extensionFromFilename(key);
    const equivalentes = EQUIVALENTES[detected.extension] ?? [detected.extension];
    if (extActual && equivalentes.includes(extActual)) return null;

    const keyNueva = `${key.replace(/\.[^./]+$/, '')}.${detected.extension}`;
    if (keyNueva === key) return null;

    const referencias = await prisma.userDocumentHistory.count({ where: { url: entry.url } });

    return {
      url: entry.url,
      key,
      dni: entry.dni,
      extActual,
      extCorrecta: detected.extension,
      contentType: detected.contentType,
      keyNueva,
      urlNueva: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${keyNueva}`,
      referencias,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log(APPLY ? '=== MODO APPLY — se copiarán objetos y se actualizará la base ===' : '=== DRY-RUN — no se escribe nada ===');
  console.log(`Bucket: ${BUCKET} | Alcance: ${DNI ? `DNI ${DNI}` : 'todos los documentos'}\n`);

  const urls = await findUrls();
  console.log(`URLs a analizar: ${urls.length}`);

  const analizados = await mapWithConcurrency(urls, CHECK_CONCURRENCY, analizar);
  const candidatos = analizados.filter((c): c is Candidato => c !== null);

  if (!candidatos.length) {
    console.log('\nNinguna extensión discordante. Nada que renombrar.');
    return;
  }

  console.log(`\n=== ${candidatos.length} archivos con la extensión equivocada ===\n`);
  for (const c of candidatos) {
    console.log(`DNI ${c.dni ?? 's/d'} | .${c.extActual ?? '(ninguna)'} → .${c.extCorrecta} (${c.contentType})`);
    console.log(`   ${c.key}`);
    console.log(`   → ${c.keyNueva}`);
    console.log(`   filas de historial que se actualizarán: ${c.referencias}`);
  }

  const objetivo = LIMITE > 0 ? candidatos.slice(0, LIMITE) : candidatos;

  if (!APPLY) {
    console.log('\nDRY-RUN: no se tocó nada. Volvé a correr con --apply para aplicar.');
    return;
  }

  const hechos: Record<string, unknown>[] = [];
  const fallidos: { key: string; motivo: string }[] = [];

  for (const c of objetivo) {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: c.key }));

      await s3.send(
        new CopyObjectCommand({
          Bucket: BUCKET,
          Key: c.keyNueva,
          CopySource: `${BUCKET}/${encodeURIComponent(c.key).replace(/%2F/g, '/')}`,
          MetadataDirective: 'REPLACE',
          ContentType: c.contentType,
          ...(head.CacheControl && { CacheControl: head.CacheControl }),
          ...(head.ContentDisposition && { ContentDisposition: head.ContentDisposition }),
          ...(head.Metadata && Object.keys(head.Metadata).length > 0 && { Metadata: head.Metadata }),
        }),
      );

      const actualizadas = await prisma.userDocumentHistory.updateMany({
        where: { url: c.url },
        data: { url: c.urlNueva },
      });

      hechos.push({
        dni: c.dni,
        keyAnterior: c.key,
        keyNueva: c.keyNueva,
        urlAnterior: c.url,
        urlNueva: c.urlNueva,
        contentType: c.contentType,
        historialesActualizados: actualizadas.count,
      });
      console.log(`✔ DNI ${c.dni ?? 's/d'}: ${c.key} → ${c.keyNueva} (${actualizadas.count} historiales)`);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'error desconocido';
      fallidos.push({ key: c.key, motivo });
      console.error(`✘ ${c.key}: ${motivo}`);
    }
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}/repair-03-file-extension${DNI ? `-${DNI}` : ''}.json`;
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        bucket: BUCKET,
        alcance: DNI ? `DNI ${DNI}` : 'todos',
        hechos,
        fallidos,
        nota: 'Los objetos originales NO se borraron: siguen en S3 con su key anterior.',
        revertir: hechos
          .map((h) => `UPDATE UserDocumentHistory SET url = '${String(h.urlAnterior)}' WHERE url = '${String(h.urlNueva)}';`)
          .join('\n'),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nRenombrados: ${hechos.length} | Fallidos: ${fallidos.length}`);
  console.log(`Log escrito en ${logPath} (incluye el SQL para revertir).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
