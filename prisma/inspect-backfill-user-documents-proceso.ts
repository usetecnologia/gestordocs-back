import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Solo lectura. Precondiciones de M4 (`UserDocuments.procesoId`): que toda fila de `UserDocuments`
 * tenga un proceso al que colgarse — si no, el `NOT NULL` del final falla — y que el tipo de la
 * columna nueva coincida con `procesos.id`, que es el error del plan descrito en §3.1.
 */
async function main() {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (s: string, p: any[] = []) => (await c.query(s, p)) as any[];
  const n = async (s: string, p: any[] = []) => Number((await q(s, p))[0].n);

  console.log('== 1. Tipos reales de las columnas que se van a relacionar ==');
  for (const r of await q(
    `SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE nul, COLLATION_NAME col
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND ((TABLE_NAME = 'UserDocuments' AND COLUMN_NAME IN ('id','userId','proceso_id'))
          OR (TABLE_NAME = 'procesos' AND COLUMN_NAME = 'id'))
      ORDER BY t, c`)) {
    console.log(`   ${r.t}.${r.c}`.padEnd(28), r.ty.padEnd(14), 'null=' + r.nul, r.col ?? '');
  }

  console.log('\n== 2. Cobertura del backfill ==');
  console.log('  UserDocuments                  ', await n('SELECT COUNT(*) n FROM UserDocuments'));
  console.log('  con userId inexistente         ', await n(
    'SELECT COUNT(*) n FROM UserDocuments ud WHERE NOT EXISTS (SELECT 1 FROM User u WHERE u.id = ud.userId)'));
  console.log('  SIN proceso para su userId     ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud
      WHERE NOT EXISTS (SELECT 1 FROM procesos p WHERE p.participante_id = ud.userId)`));
  console.log('  SIN proceso abierto            ', await n(
    `SELECT COUNT(*) n FROM UserDocuments ud
      WHERE NOT EXISTS (SELECT 1 FROM procesos p WHERE p.participante_id = ud.userId AND p.activo = 1)`));

  console.log('\n== 3. Ambiguedad: usuarios con mas de un proceso ==');
  console.log('  usuarios con >1 proceso        ', await n(
    'SELECT COUNT(*) n FROM (SELECT participante_id FROM procesos GROUP BY participante_id HAVING COUNT(*) > 1) x'));

  console.log('\n== 4. Duenos de UserDocuments por rol ==');
  for (const r of await q(
    `SELECT r.code, COUNT(*) n FROM UserDocuments ud
       JOIN User u ON u.id = ud.userId JOIN Role r ON r.id = u.role_id
      GROUP BY r.code ORDER BY n DESC`)) {
    console.log(`   ${String(r.n).padStart(6)}  ${r.code}`);
  }

  console.log('\n== 5. Apuntador doble (contexto de §7, NO se toca en M4) ==');
  console.log('  solo documentId                ', await n(
    'SELECT COUNT(*) n FROM UserDocuments WHERE documentId IS NOT NULL AND documentSponsorId IS NULL'));
  console.log('  solo documentSponsorId         ', await n(
    'SELECT COUNT(*) n FROM UserDocuments WHERE documentSponsorId IS NOT NULL AND documentId IS NULL'));
  console.log('  ambos                          ', await n(
    'SELECT COUNT(*) n FROM UserDocuments WHERE documentId IS NOT NULL AND documentSponsorId IS NOT NULL'));
  console.log('  ninguno                        ', await n(
    'SELECT COUNT(*) n FROM UserDocuments WHERE documentId IS NULL AND documentSponsorId IS NULL'));

  await c.end();
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
