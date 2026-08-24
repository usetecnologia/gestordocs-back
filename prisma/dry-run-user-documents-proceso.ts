import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Ensayo de la resolucion del backfill de M4, en SELECT. El ALTER TABLE de la migracion no es
 * transaccional en MariaDB, asi que no se puede correr y revertir como se hizo con M3: en su lugar
 * se evalua la misma subconsulta que usa el UPDATE y se comprueba que resuelva para todas las
 * filas y al proceso correcto. Solo lectura.
 *
 * Sirve igual despues de aplicar: las mismas preguntas, contra la columna ya escrita.
 */
const RESUELVE = `(
  SELECT p.id FROM procesos p
   WHERE p.participante_id = ud.userId
   ORDER BY p.activo IS NULL, p.fecha_ingreso DESC
   LIMIT 1
)`;

(async () => {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (s: string) => (await c.query(s)) as any[];
  const n = async (s: string) => Number((await q(s))[0].n);

  console.log('== La subconsulta del UPDATE, evaluada sin escribir ==');
  console.log('  filas de UserDocuments         ', await n('SELECT COUNT(*) n FROM UserDocuments'));
  console.log('  no resuelven a ningun proceso  ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud WHERE ${RESUELVE} IS NULL`));
  console.log('  resuelven a proceso de OTRO    ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud
      WHERE ${RESUELVE} NOT IN (SELECT p2.id FROM procesos p2 WHERE p2.participante_id = ud.userId)`));
  console.log('  resuelven a proceso NO abierto ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud
      WHERE ${RESUELVE} IN (SELECT p2.id FROM procesos p2 WHERE p2.activo IS NULL)`));
  console.log('  procesos distintos apuntados   ', await n(
    `SELECT COUNT(DISTINCT ${RESUELVE}) n FROM UserDocuments ud`));

  const columna = await q(
    `SELECT COUNT(*) n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserDocuments' AND COLUMN_NAME = 'proceso_id'`);
  if (!Number(columna[0].n)) { console.log('\n(la columna proceso_id todavia no existe)'); await c.end(); return; }

  console.log('\n== La columna ya escrita ==');
  console.log('  proceso_id NULL                ', await n('SELECT COUNT(*) n FROM UserDocuments WHERE proceso_id IS NULL'));
  console.log('  distinto de lo que resuelve    ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud WHERE NOT (ud.proceso_id <=> ${RESUELVE})`));
  console.log('  proceso de otro participante   ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud JOIN procesos p ON p.id = ud.proceso_id
      WHERE p.participante_id <> ud.userId`));
  console.log('  procesos distintos apuntados   ', await n('SELECT COUNT(DISTINCT proceso_id) n FROM UserDocuments'));
  console.log('  procesos sin ningun documento  ', await n(
    `SELECT COUNT(*) n FROM procesos p
      WHERE NOT EXISTS (SELECT 1 FROM UserDocuments ud WHERE ud.proceso_id = p.id)`));

  await c.end();
})().catch((e) => { console.error('ERROR:', e.code ?? '', e.message); process.exit(1); });
