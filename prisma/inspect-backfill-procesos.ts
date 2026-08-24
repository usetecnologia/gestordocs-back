import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Solo lectura. Verifica las precondiciones del backfill de `procesos` (M3) antes de escribir la
 * migracion: que la tabla este vacia, que ningun participante tenga NULL en las columnas que en
 * `procesos` son NOT NULL, que las FK apunten a filas que existen, y que la temporada a asignar
 * sea la esperada. Cada bloque imprime el numero que se compara contra el documento de estado.
 */
async function main() {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (sql: string, p: any[] = []) => (await c.query(sql, p)) as any[];
  const uno = async (sql: string, p: any[] = []) => Number((await q(sql, p))[0].n);

  console.log('== 1. Estado de partida ==');
  console.log('  procesos (debe ser 0)          ', await uno('SELECT COUNT(*) n FROM procesos'));
  const rolePart = await q("SELECT id FROM Role WHERE code = 'PARTICIPANTE'");
  if (rolePart.length !== 1) throw new Error(`Rol PARTICIPANTE no unico: ${rolePart.length}`);
  const roleId = rolePart[0].id;
  const totalPart = await uno('SELECT COUNT(*) n FROM User WHERE role_id = ?', [roleId]);
  console.log('  participantes                  ', totalPart);

  console.log('\n== 2. Columnas NOT NULL en procesos (debe ser 0) ==');
  console.log('  sin programId / opcion / pais  ', await uno(
    `SELECT COUNT(*) n FROM User WHERE role_id = ?
       AND (programId IS NULL OR optionProgramId IS NULL OR countryId IS NULL)`, [roleId]));
  for (const r of await q(
    `SELECT id, username, programId, optionProgramId, countryId FROM User WHERE role_id = ?
       AND (programId IS NULL OR optionProgramId IS NULL OR countryId IS NULL) LIMIT 10`, [roleId])) {
    console.log('   ->', r.id, r.username, r.programId, r.optionProgramId, r.countryId);
  }

  console.log('\n== 3. FK huerfanas: apuntan a filas inexistentes (debe ser 0) ==');
  const huerfanas: Array<[string, string, string]> = [
    ['programId', 'Program', 'programa'],
    ['optionProgramId', 'OptionProgram', 'opcion'],
    ['countryId', 'Country', 'pais'],
    ['sponsorId', 'Sponsor', 'sponsor'],
  ];
  for (const [col, tabla, etiq] of huerfanas) {
    console.log(`  ${etiq.padEnd(30)}`, await uno(
      `SELECT COUNT(*) n FROM User u WHERE u.role_id = ? AND u.${col} IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${tabla} t WHERE t.id = u.${col})`, [roleId]));
  }

  console.log('\n== 4. Sponsor ==');
  console.log('  con sponsor                    ', await uno(
    'SELECT COUNT(*) n FROM User WHERE role_id = ? AND sponsorId IS NOT NULL', [roleId]));
  console.log('  sin sponsor                    ', await uno(
    'SELECT COUNT(*) n FROM User WHERE role_id = ? AND sponsorId IS NULL', [roleId]));
  console.log('  con sponsor y status_hired <> 1', await uno(
    `SELECT COUNT(*) n FROM User WHERE role_id = ? AND sponsorId IS NOT NULL
       AND (status_hired IS NULL OR status_hired <> 1)`, [roleId]));

  console.log('\n== 5. Temporadas en base ==');
  for (const t of await q(
    `SELECT t.id, t.name, t.status, t.createAt, p.name programa
       FROM Temporada t JOIN Program p ON p.id = t.programId ORDER BY t.createAt`)) {
    console.log(`   ${t.programa} | ${t.name} | status=${t.status} | ${t.createAt.toISOString?.() ?? t.createAt}`);
  }

  console.log('\n== 6. Participantes por programa y temporada que les tocaria ==');
  for (const r of await q(
    `SELECT p.id, p.name programa, COUNT(*) n
       FROM User u JOIN Program p ON p.id = u.programId
      WHERE u.role_id = ? GROUP BY p.id, p.name ORDER BY n DESC`, [roleId])) {
    const t = await q(
      `SELECT name, id FROM Temporada WHERE programId = ? AND status = 1
        ORDER BY createAt DESC LIMIT 1`, [r.id]);
    console.log(`   ${String(r.n).padStart(5)}  ${r.programa.padEnd(28)} -> ${t.length ? t[0].name : '(sin temporada)'}`);
  }

  console.log('\n== 7. Distribucion de User.status (sera statusDocumental) ==');
  for (const r of await q(
    'SELECT status, COUNT(*) n FROM User WHERE role_id = ? GROUP BY status ORDER BY n DESC', [roleId])) {
    console.log(`   ${String(r.n).padStart(5)}  ${r.status}`);
  }

  await c.end();
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
