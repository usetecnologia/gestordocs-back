import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as mariadb from 'mariadb';

// Backup completo (schema + datos) de la BD configurada en .env, sin depender de mysqldump
// (no disponible en este entorno). Genera dos archivos por corrida bajo /backups:
//   - <timestamp>-schema.sql  -> CREATE TABLE de cada tabla (referencia, no ejecutable de una)
//   - <timestamp>-data.json   -> { [tabla]: fila[] } completo, listo para un restore por INSERTs

async function main() {
  const conn = await mariadb.createConnection({
    host: process.env.HOST_DB!,
    user: process.env.USER_DB!,
    password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!,
    port: Number(process.env.PORT_DB ?? 3306),
  });

  try {
    const dbName = process.env.DATABASE_DB!;
    const tables: { TABLE_NAME: string }[] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [dbName],
    );
    const tableNames = tables.map((t) => t.TABLE_NAME).sort();

    console.log(`Base de datos: ${dbName} (${tableNames.length} tablas)`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(outDir, { recursive: true });

    const schemaParts: string[] = [];
    const data: Record<string, unknown[]> = {};

    for (const table of tableNames) {
      const createRows: Record<string, string>[] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      const createStatement = createRows[0]['Create Table'];
      schemaParts.push(`-- Tabla: ${table}\n${createStatement};\n`);

      const rows = await conn.query(`SELECT * FROM \`${table}\``);
      data[table] = rows;
      console.log(`  ${table}: ${rows.length} filas`);
    }

    const schemaPath = path.join(outDir, `${timestamp}-schema.sql`);
    const dataPath = path.join(outDir, `${timestamp}-data.json`);

    fs.writeFileSync(schemaPath, schemaParts.join('\n'), 'utf-8');
    fs.writeFileSync(
      dataPath,
      JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
      'utf-8',
    );

    console.log(`\nBackup completo.`);
    console.log(`  Schema: ${schemaPath}`);
    console.log(`  Datos:  ${dataPath}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Error al generar el backup:', err);
  process.exit(1);
});
