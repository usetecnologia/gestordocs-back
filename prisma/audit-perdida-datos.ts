import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Auditoría de solo lectura previa a 20260730120000_add_user_documents_active_unique.
 *
 * La migración no borra filas: desactiva (status_document = 0) los duplicados y conserva uno.
 * Pero "no borrar" no alcanza — si el registro que se desactiva tuviera el archivo subido y el
 * que se conserva no, el participante dejaría de ver su documento. Eso es lo que se comprueba.
 */

const columnas = ['documentSponsorId', 'documentId'] as const;

const query = (col: string) => `
  SELECT ud.id, ud.userId, ud.${col} AS target, ud.status, ranked.rn,
         (SELECT COUNT(*) FROM UserDocumentHistory h WHERE h.userDocumentsId = ud.id) AS hist,
         (SELECT COUNT(*) FROM UserDocumentHistory h
           WHERE h.userDocumentsId = ud.id AND h.url IS NOT NULL AND h.url <> '') AS conUrl,
         (SELECT COUNT(*) FROM UserDocumentObservationFiles f
            JOIN UserDocumentHistory h2 ON h2.id = f.userDocumentHistoryId
           WHERE h2.userDocumentsId = ud.id) AS archivosObs
  FROM UserDocuments ud
  JOIN (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY userId, ${col}
                 ORDER BY updated_at DESC, created_at DESC, id DESC) AS rn,
             COUNT(*) OVER (PARTITION BY userId, ${col}) AS total
      FROM UserDocuments WHERE ${col} IS NOT NULL AND status_document = 1
  ) ranked ON ranked.id = ud.id
  WHERE ranked.total > 1
  ORDER BY ud.userId, target, ranked.rn
`;

async function main() {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });

  let riesgo = 0;
  for (const col of columnas) {
    const rows: any[] = await c.query(query(col));
    const grupos = new Map<string, any[]>();
    for (const r of rows) {
      const k = `${r.userId}|${r.target}`;
      (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(r);
    }

    const aDesactivar = rows.filter((r) => Number(r.rn) > 1);
    const conUrlPerdida = aDesactivar.filter((r) => Number(r.conUrl) > 0);
    const conEstadoAvanzado = aDesactivar.filter((r) => r.status !== 'PENDIENTE');
    const conArchivosObs = aDesactivar.filter((r) => Number(r.archivosObs) > 0);

    console.log(`\n=== ${col} ===`);
    console.log(`  Grupos duplicados:            ${grupos.size}`);
    console.log(`  Filas que se desactivan:      ${aDesactivar.length}`);
    console.log(`  ...con archivo subido (url):  ${conUrlPerdida.length}`);
    console.log(`  ...con estado != PENDIENTE:   ${conEstadoAvanzado.length}`);
    console.log(`  ...con archivos de observac.: ${conArchivosObs.length}`);

    // Lo unico realmente grave: que el desactivado tenga algo que el conservado no tiene.
    for (const [k, filas] of grupos) {
      const conservado = filas.find((f) => Number(f.rn) === 1);
      const desactivados = filas.filter((f) => Number(f.rn) > 1);
      for (const d of desactivados) {
        const pierdeUrl = Number(d.conUrl) > 0 && Number(conservado?.conUrl ?? 0) === 0;
        const pierdeEstado = d.status !== 'PENDIENTE' && conservado?.status === 'PENDIENTE';
        if (pierdeUrl || pierdeEstado) {
          riesgo++;
          console.log(`  ⚠ ${k}`);
          console.log(`      se desactiva ud=${d.id} status=${d.status} url=${d.conUrl} hist=${d.hist}`);
          console.log(`      se conserva  ud=${conservado.id} status=${conservado.status} url=${conservado.conUrl} hist=${conservado.hist}`);
        }
      }
    }
  }

  console.log('\n=== Veredicto ===');
  console.log(
    riesgo === 0
      ? '✅ Ningún participante pierde acceso a un archivo ni a un estado avanzado.\n   Ninguna fila se elimina: solo cambia status_document de 1 a 0.'
      : `❌ NO APLICAR: ${riesgo} caso(s) donde el registro desactivado tiene más progreso que el conservado.`,
  );
  await c.end();
  process.exit(riesgo === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
