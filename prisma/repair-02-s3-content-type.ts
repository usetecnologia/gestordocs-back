import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  CopyObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import {
  breaksRendering,
  detectFileType,
  normalizeContentType,
} from '@common/utils/file-type.util';

/**
 * REPARACIÓN — corrige el Content-Type de los archivos mal guardados en S3 (documento del
 * incidente, §4.4 b y el barrido de §4.5).
 *
 * Qué arregla: el commit 458d146 (1/7/2026 18:01) cambió el Content-Type de subida por el deducido
 * de la EXTENSIÓN DEL NOMBRE. Un JPEG llamado "pasaporte.pdf" quedó guardado como `application/pdf`,
 * y como el navegador decide cómo mostrar un archivo por el Content-Type que declara el servidor
 * —no por la extensión de la URL—, esos documentos no se pueden ver aunque estén perfectos.
 *
 *   Dry-run (por defecto):  npx ts-node -r tsconfig-paths/register prisma/repair-02-s3-content-type.ts
 *   Aplicar:                npx ts-node -r tsconfig-paths/register prisma/repair-02-s3-content-type.ts --apply
 *   Opciones:               --desde=2026-07-01   (fecha mínima de los historiales a barrer)
 *                           --todo               (sin filtro de fecha)
 *
 * Criterio de corrección: la misma regla del fix 4 (`breaksRendering`). Solo se toca un archivo si el
 * tipo declarado y el real pertenecen a familias de renderizado distintas (imagen ↔ PDF ↔ otro): un
 * PNG servido como `image/jpeg` se ve perfecto porque el navegador hace sniffing entre imágenes, y
 * "corregirlo" sería tocar 17.000 archivos sin que nadie note la diferencia.
 *
 * Garantías:
 *   - Nada se borra ni se sube: `CopyObject` sobre sí mismo con `MetadataDirective: REPLACE`, que
 *     solo reescribe los metadatos. El contenido del objeto no cambia (mismo tamaño, mismos bytes).
 *   - Antes de reemplazar se lee la metadata actual con `HeadObject` y se reenvía tal cual, para no
 *     perder `ContentDisposition`, `CacheControl` ni metadatos propios al reescribir.
 *   - La base de datos NO se toca en ningún caso: la URL del archivo no cambia.
 *   - Log en disco con el antes/después de cada objeto.
 */

const APPLY = process.argv.includes('--apply');
const SIN_FILTRO_FECHA = process.argv.includes('--todo');
const DESDE =
  process.argv.find((a) => a.startsWith('--desde='))?.split('=')[1] ?? '2026-07-01';
/** Tope de objetos a corregir en esta corrida — para validar sobre una muestra antes del lote completo. */
const LIMITE = Number(process.argv.find((a) => a.startsWith('--limite='))?.split('=')[1] ?? 0);
const LOG_DIR = 'reparacion-datos';
const CHECK_CONCURRENCY = 16;
const REQUEST_TIMEOUT_MS = 20_000;

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

type Veredicto =
  /** Declarado y real coinciden (o son alias del mismo formato): nada que hacer. */
  | 'OK'
  /** Difieren pero el navegador lo resuelve solo (imagen ↔ imagen): no se toca. */
  | 'INOCUO'
  /** El desajuste impide ver el archivo: hay que corregirlo. */
  | 'ROMPE'
  /** No se reconoce la firma de bytes (docx, zip…): no se puede decidir, no se toca. */
  | 'TIPO_DESCONOCIDO'
  /** El objeto no se pudo leer. */
  | 'ERROR';

interface Analisis {
  url: string;
  key: string;
  declarado: string;
  real: string | null;
  veredicto: Veredicto;
  detalle?: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** URLs distintas de archivos de documentos y de archivos de observación. */
async function findUrls(): Promise<string[]> {
  const historial = SIN_FILTRO_FECHA
    ? await prisma.$queryRaw<{ url: string }[]>`
        SELECT DISTINCT url FROM UserDocumentHistory WHERE url IS NOT NULL
      `
    : await prisma.$queryRaw<{ url: string }[]>`
        SELECT DISTINCT url FROM UserDocumentHistory
        WHERE url IS NOT NULL AND created_at >= ${`${DESDE} 00:00:00`}
      `;

  const observacion = await prisma.$queryRaw<{ url: string }[]>`
    SELECT DISTINCT file AS url FROM UserDocumentObservationFiles
    UNION
    SELECT DISTINCT file AS url FROM UserObservationFiles
  `;

  const todas = [...historial, ...observacion].map((r) => r.url).filter(Boolean);
  return [...new Set(todas)];
}

/** Key del objeto dentro del bucket, o null si la URL no apunta a este bucket. */
function keyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.startsWith(`${BUCKET}.s3`)) return null;
    return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    return null;
  }
}

/** Lee los primeros bytes del objeto y compara su tipo real con el declarado. */
async function analizar(url: string): Promise<Analisis> {
  const key = keyFromUrl(url);
  if (!key) {
    return { url, key: '', declarado: '', real: null, veredicto: 'ERROR', detalle: 'URL ajena al bucket' };
  }

  try {
    let response = await fetch(url, {
      headers: { Range: 'bytes=0-31' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 416 = el archivo tiene menos bytes que el rango pedido. Son archivos diminutos (a veces
    // vacíos): se piden completos, que no cuesta nada, para poder analizarlos igual.
    if (response.status === 416) {
      response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    }

    if (!response.ok && response.status !== 206) {
      return {
        url,
        key,
        declarado: '',
        real: null,
        veredicto: 'ERROR',
        detalle: `HTTP ${response.status}`,
      };
    }

    const declarado = normalizeContentType(response.headers.get('content-type') ?? '');
    const bytes = Buffer.from(await response.arrayBuffer());
    const real = detectFileType(bytes)?.contentType ?? null;

    if (!bytes.length) {
      return { url, key, declarado, real: null, veredicto: 'ERROR', detalle: 'archivo VACÍO (0 bytes)' };
    }
    if (!real) {
      return {
        url,
        key,
        declarado,
        real,
        veredicto: 'TIPO_DESCONOCIDO',
        detalle: `${bytes.length} bytes leídos, firma no reconocida`,
      };
    }
    if (declarado === real) return { url, key, declarado, real, veredicto: 'OK' };
    return {
      url,
      key,
      declarado,
      real,
      veredicto: breaksRendering(declarado, real) ? 'ROMPE' : 'INOCUO',
    };
  } catch (err) {
    return {
      url,
      key,
      declarado: '',
      real: null,
      veredicto: 'ERROR',
      detalle: err instanceof Error ? err.message : 'error desconocido',
    };
  }
}

/** Reescribe solo los metadatos del objeto, preservando los que ya tenía. */
async function corregir(item: Analisis): Promise<void> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: item.key }));

  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      Key: item.key,
      CopySource: `${BUCKET}/${encodeURIComponent(item.key).replace(/%2F/g, '/')}`,
      MetadataDirective: 'REPLACE',
      ContentType: item.real!,
      ...(head.CacheControl && { CacheControl: head.CacheControl }),
      ...(head.ContentDisposition && { ContentDisposition: head.ContentDisposition }),
      ...(head.ContentEncoding && { ContentEncoding: head.ContentEncoding }),
      ...(head.ContentLanguage && { ContentLanguage: head.ContentLanguage }),
      ...(head.Metadata && Object.keys(head.Metadata).length > 0 && { Metadata: head.Metadata }),
    }),
  );
}

async function main() {
  console.log(APPLY ? '=== MODO APPLY — se reescribirán metadatos en S3 ===' : '=== DRY-RUN — no se toca S3 ===');
  console.log(`Bucket: ${BUCKET} (${REGION})`);
  console.log(`Alcance: ${SIN_FILTRO_FECHA ? 'todas las URLs registradas' : `historiales desde ${DESDE}`}\n`);

  const urls = await findUrls();
  console.log(`Archivos distintos a verificar: ${urls.length}`);
  console.log('Verificando (esto tarda unos minutos)...\n');

  let procesados = 0;
  const analisis = await mapWithConcurrency(urls, CHECK_CONCURRENCY, async (url) => {
    const result = await analizar(url);
    procesados++;
    if (procesados % 1000 === 0) console.log(`   ${procesados}/${urls.length}...`);
    return result;
  });

  const porVeredicto = new Map<Veredicto, Analisis[]>();
  for (const a of analisis) {
    const list = porVeredicto.get(a.veredicto) ?? [];
    list.push(a);
    porVeredicto.set(a.veredicto, list);
  }

  console.log('\n=== Resultado del barrido ===');
  console.table(
    (['OK', 'INOCUO', 'ROMPE', 'TIPO_DESCONOCIDO', 'ERROR'] as Veredicto[]).map((v) => ({
      veredicto: v,
      archivos: porVeredicto.get(v)?.length ?? 0,
    })),
  );

  const inocuos = porVeredicto.get('INOCUO') ?? [];
  if (inocuos.length) {
    const combos = new Map<string, number>();
    for (const i of inocuos) combos.set(`${i.declarado} → ${i.real}`, (combos.get(`${i.declarado} → ${i.real}`) ?? 0) + 1);
    console.log('--- INOCUO: difieren pero se ven bien (no se tocan) ---');
    console.table([...combos.entries()].map(([combinacion, veces]) => ({ combinacion, veces })));
  }

  const errores = porVeredicto.get('ERROR') ?? [];
  if (errores.length) {
    console.log(`--- ERROR: ${errores.length} archivos no se pudieron leer (primeros 10) ---`);
    errores.slice(0, 10).forEach((e) => console.log(`   ${e.detalle}  ${e.url}`));
  }

  const aCorregir = porVeredicto.get('ROMPE') ?? [];
  if (!aCorregir.length) {
    console.log('\nNo hay archivos cuyo Content-Type impida verlos. Nada que corregir.');
    return;
  }

  console.log(`\n=== ${aCorregir.length} archivos a corregir ===`);
  const combos = new Map<string, number>();
  for (const a of aCorregir) combos.set(`${a.declarado} → ${a.real}`, (combos.get(`${a.declarado} → ${a.real}`) ?? 0) + 1);
  console.table([...combos.entries()].map(([combinacion, veces]) => ({ combinacion, veces })));
  aCorregir.forEach((a) => console.log(`   ${a.declarado} → ${a.real}   ${a.key}`));

  if (!APPLY) {
    console.log('\nDRY-RUN: no se tocó S3. Volvé a correr con --apply para corregir.');
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(
      `${LOG_DIR}/repair-02-s3-content-type.dry-run.json`,
      JSON.stringify({ total: urls.length, aCorregir, inocuos: inocuos.length, errores }, null, 2),
      'utf8',
    );
    console.log(`Inventario guardado en ${LOG_DIR}/repair-02-s3-content-type.dry-run.json`);
    return;
  }

  const corregidos: Analisis[] = [];
  const fallidos: { key: string; motivo: string }[] = [];

  // Con --limite se corrige solo una muestra: los que rompen de verdad la visualización van primero
  // (los de tipo cruzado imagen↔PDF, que son los casos conocidos), y después los octet-stream.
  const orden = [...aCorregir].sort((a, b) => {
    const prioridad = (x: Analisis) => (x.declarado === 'application/octet-stream' ? 1 : 0);
    return prioridad(a) - prioridad(b);
  });
  const objetivo = LIMITE > 0 ? orden.slice(0, LIMITE) : orden;

  if (LIMITE > 0) {
    console.log(`\n⚠ --limite=${LIMITE}: se corrigen ${objetivo.length} de ${aCorregir.length}.`);
  }

  for (const item of objetivo) {
    try {
      await corregir(item);
      corregidos.push(item);
      console.log(`✔ ${item.key}: ${item.declarado} → ${item.real}`);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : 'error desconocido';
      fallidos.push({ key: item.key, motivo });
      console.error(`✘ ${item.key}: ${motivo}`);
    }
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}/repair-02-s3-content-type.json`;
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        bucket: BUCKET,
        alcance: SIN_FILTRO_FECHA ? 'todas' : `desde ${DESDE}`,
        verificados: urls.length,
        detectados: aCorregir.length,
        limite: LIMITE > 0 ? LIMITE : null,
        pendientes: aCorregir.length - corregidos.length,
        corregidos: corregidos.map((c) => ({
          key: c.key,
          url: c.url,
          contentTypeAnterior: c.declarado,
          contentTypeNuevo: c.real,
        })),
        fallidos,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nCorregidos: ${corregidos.length} | Fallidos: ${fallidos.length}`);
  console.log(`Log escrito en ${logPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
