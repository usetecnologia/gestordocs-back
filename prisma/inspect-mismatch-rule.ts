import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { breaksRendering, renderingFamily } from '@common/utils/file-type.util';

/**
 * Inspección SOLO LECTURA: contrasta la regla nueva de mismatch de content-type (fix 4) contra los
 * mismatches que la corrida del 4/8/2026 dejó escritos en las observaciones.
 *
 * Responde: de los que se observaron por content-type, ¿cuántos habría observado la regla nueva?
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';

/** 'declarado ("image/jpeg") ... real ("application/pdf")' */
const MISMATCH_RE = /declarado\s*\("([^"]+)"\)[\s\S]*?real\s*\("([^"]+)"\)/;

async function main() {
  const rows = await prisma.$queryRaw<
    { id: string; dni: string | null; observation: string }[]
  >`
    SELECT h.id, p.dni, h.observation
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    JOIN Person p              ON p.id  = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND h.observation LIKE '%tipo de contenido declarado%'
    ORDER BY p.dni
  `;

  const analizadas = rows.map((r) => {
    const match = MISMATCH_RE.exec(r.observation);
    const declared = match?.[1] ?? '(no parseado)';
    const detected = match?.[2] ?? '(no parseado)';
    const soloMismatch = !/menor de edad|no corresponde a un pasaporte|exactamente 18/.test(
      r.observation,
    );
    return {
      dni: r.dni ?? '',
      declared,
      detected,
      familias: `${renderingFamily(declared)} → ${renderingFamily(detected)}`,
      seguiriaObservado: match ? breaksRendering(declared, detected) : true,
      soloPorMismatch: soloMismatch,
    };
  });

  const reales = analizadas.filter((a) => a.seguiriaObservado);
  const falsos = analizadas.filter((a) => !a.seguiriaObservado);

  console.log('=== Observaciones por content-type escritas en la BD ===');
  console.log(`Total:                          ${analizadas.length}`);
  console.log(`La regla nueva SÍ las observa:  ${reales.length}`);
  console.log(`La regla nueva las descarta:    ${falsos.length}`);
  console.log(
    `De las descartadas, observadas SOLO por el mismatch: ${
      falsos.filter((f) => f.soloPorMismatch).length
    }`,
  );

  console.log('\n=== Las que la regla nueva SIGUE observando (mismatch real) ===');
  console.table(
    reales.map(({ dni, declared, detected, familias, soloPorMismatch }) => ({
      dni,
      declared,
      detected,
      familias,
      soloPorMismatch,
    })),
  );

  console.log('\n=== Las que la regla nueva ya NO observa (falsos positivos) ===');
  console.table(
    falsos.map(({ dni, declared, detected, familias, soloPorMismatch }) => ({
      dni,
      declared,
      detected,
      familias,
      soloPorMismatch,
    })),
  );

  // Desglose de las 245 observaciones por motivo, calculado sobre la BD (el del reporte original
  // salía del Excel de progreso, que omitía 9 participantes).
  const todas = await prisma.$queryRaw<{ observation: string }[]>`
    SELECT h.observation
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
  `;
  const categoria = (obs: string): string => {
    const motivos: string[] = [];
    if (/menor de edad/.test(obs)) motivos.push('menor de edad al emitirse');
    if (/exactamente 18 años el mismo día/.test(obs)) motivos.push('cumplía 18 ese mismo día');
    if (/no corresponde a un pasaporte/.test(obs)) motivos.push('no es un pasaporte');
    if (/tipo de contenido declarado/.test(obs)) motivos.push('mismatch de content-type');
    return motivos.length ? motivos.join(' + ') : '(otro)';
  };
  const porMotivo = new Map<string, number>();
  for (const t of todas) {
    const key = categoria(t.observation);
    porMotivo.set(key, (porMotivo.get(key) ?? 0) + 1);
  }
  console.log(`\n=== Desglose de las ${todas.length} observaciones por motivo (según BD) ===`);
  console.table([...porMotivo.entries()].map(([motivo, cantidad]) => ({ motivo, cantidad })));

  const combinaciones = new Map<string, number>();
  for (const a of analizadas) {
    const key = `${a.declared} → ${a.detected}`;
    combinaciones.set(key, (combinaciones.get(key) ?? 0) + 1);
  }
  console.log('\n=== Combinaciones encontradas ===');
  console.table(
    [...combinaciones.entries()].map(([combinacion, veces]) => ({ combinacion, veces })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
