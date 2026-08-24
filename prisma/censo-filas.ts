import 'dotenv/config';
import * as fs from 'fs';
import * as mariadb from 'mariadb';

/** Censo de solo lectura. Se corre antes y despues de migrar para probar que no se borro nada. */
const CONTEOS: Record<string, string> = {
  UserDocuments: 'SELECT COUNT(*) n FROM UserDocuments',
  'UserDocuments activos': 'SELECT COUNT(*) n FROM UserDocuments WHERE status_document = 1',
  UserDocumentHistory: 'SELECT COUNT(*) n FROM UserDocumentHistory',
  'Historial con archivo': "SELECT COUNT(*) n FROM UserDocumentHistory WHERE url IS NOT NULL AND url <> ''",
  UserDocumentObservationFiles: 'SELECT COUNT(*) n FROM UserDocumentObservationFiles',
  UserDocumentHistoryEtiquetas: 'SELECT COUNT(*) n FROM UserDocumentHistoryEtiquetas',
  documents: 'SELECT COUNT(*) n FROM documents',
  document_sponsors: 'SELECT COUNT(*) n FROM document_sponsors',
  document_programs: 'SELECT COUNT(*) n FROM document_programs',
  document_program_descriptions: 'SELECT COUNT(*) n FROM document_program_descriptions',
  User: 'SELECT COUNT(*) n FROM User',
  Temporada: 'SELECT COUNT(*) n FROM Temporada',
  procesos: 'SELECT COUNT(*) n FROM procesos',
  'procesos abiertos': 'SELECT COUNT(*) n FROM procesos WHERE activo = 1',
};

async function main() {
  const etiqueta = process.argv[2] ?? 'censo';
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const out: Record<string, number> = {};
  for (const [nombre, sql] of Object.entries(CONTEOS)) {
    const r: any[] = await c.query(sql);
    out[nombre] = Number(r[0].n);
    console.log(`  ${nombre.padEnd(32)} ${String(out[nombre]).padStart(8)}`);
  }
  fs.writeFileSync(`prisma/censo-${etiqueta}.json`, JSON.stringify(out, null, 2));
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
