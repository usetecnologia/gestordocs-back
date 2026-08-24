import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Solo lectura. Mide la exposicion al hueco que deja el paso 6: al eliminarse la herencia entre
 * vinculos de sponsor, un cambio de sponsor con el proceso abierto desactiva la fila del sponsor
 * viejo y crea una nueva en PENDIENTE. Si el documento lo exigen los dos sponsors, el archivo ya
 * subido deja de estar a la vista y el participante tiene que volver a subirlo.
 *
 * Lo que se cuenta es la poblacion en riesgo ANTE UN FUTURO cambio de sponsor: nada de esto se
 * rompio, y los datos siguen en base.
 */
async function main() {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (s: string) => (await c.query(s)) as any[];
  const n = async (s: string) => Number((await q(s))[0].n);

  console.log('== Documentos del catalogo exigidos por sponsor ==');
  for (const r of await q(
    `SELECT sponsors, COUNT(*) n FROM (
       SELECT ds.document_id, COUNT(DISTINCT ds.sponsor_id) sponsors
         FROM document_sponsors ds GROUP BY ds.document_id
     ) x GROUP BY sponsors ORDER BY sponsors`)) {
    console.log(`   ${String(r.n).padStart(3)} documentos exigidos por ${r.sponsors} sponsor(s)`);
  }

  console.log('\n== Filas activas colgadas de un vinculo de sponsor ==');
  console.log('  total                          ', await n(
    'SELECT COUNT(*) n FROM UserDocuments WHERE documentSponsorId IS NOT NULL AND status_document = 1'));
  console.log('  con avance real (no PENDIENTE)  ', await n(
    `SELECT COUNT(*) n FROM UserDocuments
      WHERE documentSponsorId IS NOT NULL AND status_document = 1 AND status <> 'PENDIENTE'`));

  console.log('\n== En riesgo ante un cambio de sponsor ==');
  const enRiesgo = `
    FROM UserDocuments ud
    JOIN document_sponsors ds ON ds.id = ud.documentSponsorId
   WHERE ud.status_document = 1
     AND ud.status <> 'PENDIENTE'
     AND (SELECT COUNT(DISTINCT ds2.sponsor_id) FROM document_sponsors ds2
           WHERE ds2.document_id = ds.document_id) > 1`;
  console.log('  filas con avance que se perderian de vista', await n(`SELECT COUNT(*) n ${enRiesgo}`));
  console.log('  participantes afectados                   ', await n(
    `SELECT COUNT(DISTINCT ud.userId) n ${enRiesgo}`));
  console.log('  de esas filas, con archivo subido         ', await n(
    `SELECT COUNT(*) n ${enRiesgo}
       AND EXISTS (SELECT 1 FROM UserDocumentHistory h
                    WHERE h.userDocumentsId = ud.id AND h.url IS NOT NULL AND h.url <> '')`));

  console.log('\n  (nota: es exposicion ante un cambio FUTURO de sponsor, no un dato perdido)');
  await c.end();
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
