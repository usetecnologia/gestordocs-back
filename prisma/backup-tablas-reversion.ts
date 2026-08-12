import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as mariadb from 'mariadb';

/**
 * Respaldo previo a la reversión de la corrida del 7/8/2026 (Fase 0 del incidente).
 *
 * SOLO LECTURA sobre la base: hace SELECT * de las 5 tablas que la reversión toca y las escribe a
 * disco. No usa mysqldump porque no está disponible en este entorno (mismo motivo que
 * backup-database.ts), pero a diferencia de ese script respalda solo las tablas involucradas, que es
 * lo que pide el playbook del incidente y tarda una fracción.
 *
 * Genera bajo /backups:
 *   <timestamp>-reversion-schema.sql  → CREATE TABLE de las 5 tablas
 *   <timestamp>-reversion-data.json   → { [tabla]: fila[] } completo
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/backup-tablas-reversion.ts
 */

const TABLAS = [
  'UserDocuments',
  'UserDocumentHistory',
  'UserDocumentHistoryEtiquetas',
  'UserHistoryStatus',
  'User',
];

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.HOST_DB!,
    user: process.env.USER_DB!,
    password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!,
    port: Number(process.env.PORT_DB ?? 3306),
  });

  try {
    console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
    console.log(`Respaldando ${TABLAS.length} tablas (solo lectura)...\n`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(outDir, { recursive: true });

    const schemaParts: string[] = [];
    const data: Record<string, unknown[]> = {};
    let totalFilas = 0;

    for (const tabla of TABLAS) {
      const createRows: Record<string, string>[] = await conn.query(`SHOW CREATE TABLE \`${tabla}\``);
      schemaParts.push(`-- Tabla: ${tabla}\n${createRows[0]['Create Table']};\n`);

      const rows: unknown[] = await conn.query(`SELECT * FROM \`${tabla}\``);
      data[tabla] = rows;
      totalFilas += rows.length;
      console.log(`  ${tabla.padEnd(32)} ${rows.length} filas`);
    }

    const schemaPath = path.join(outDir, `${timestamp}-reversion-schema.sql`);
    const dataPath = path.join(outDir, `${timestamp}-reversion-data.json`);

    fs.writeFileSync(schemaPath, schemaParts.join('\n'), 'utf-8');
    fs.writeFileSync(
      dataPath,
      JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      'utf-8',
    );

    const mb = (fs.statSync(dataPath).size / 1024 / 1024).toFixed(1);
    console.log(`\nRespaldo completo — ${totalFilas} filas, ${mb} MB`);
    console.log(`  Schema: ${schemaPath}`);
    console.log(`  Datos:  ${dataPath}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Error al generar el respaldo:', err);
  process.exit(1);
});
