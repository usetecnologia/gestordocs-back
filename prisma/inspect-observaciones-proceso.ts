import 'dotenv/config';
import * as mariadb from 'mariadb';

/**
 * Solo lectura. Alcance de acotar `UserObservations` al proceso: una observacion abierta del ciclo
 * anterior manda al participante a OBSERVADO en el ciclo nuevo, sin que haya subido nada.
 */
async function main() {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (s: string) => (await c.query(s)) as any[];
  const n = async (s: string) => Number((await q(s))[0].n);
  const rol = "(SELECT id FROM Role WHERE code='PARTICIPANTE')";

  console.log('UserObservations                    ', await n('SELECT COUNT(*) n FROM UserObservations'));
  console.log('  activas (status=1 y endDate NULL) ', await n('SELECT COUNT(*) n FROM UserObservations WHERE status = 1 AND endDate IS NULL'));
  console.log('  de NO participantes               ', await n(
    `SELECT COUNT(*) n FROM UserObservations o JOIN User u ON u.id = o.userId WHERE u.role_id <> ${rol}`));
  console.log('  con userId inexistente            ', await n(
    'SELECT COUNT(*) n FROM UserObservations o WHERE NOT EXISTS (SELECT 1 FROM User u WHERE u.id = o.userId)'));
  console.log('  sin proceso al que asignarse      ', await n(
    `SELECT COUNT(*) n FROM UserObservations o
      WHERE NOT EXISTS (SELECT 1 FROM procesos p WHERE p.participante_id = o.userId)`));

  console.log('\nparticipantes con observacion activa', await n(
    'SELECT COUNT(DISTINCT userId) n FROM UserObservations WHERE status = 1 AND endDate IS NULL'));
  console.log('  de esos, con mas de un proceso    ', await n(
    `SELECT COUNT(*) n FROM (
       SELECT o.userId FROM UserObservations o WHERE o.status = 1 AND o.endDate IS NULL
        GROUP BY o.userId
       HAVING (SELECT COUNT(*) FROM procesos p WHERE p.participante_id = o.userId) > 1) x`));

  console.log('\nregla de backfill: el proceso vigente cuando se creo la observacion');
  for (const r of await q(
    `SELECT COUNT(*) n, SUM(asignado IS NULL) sin_asignar FROM (
       SELECT o.id, (
         SELECT p.id FROM procesos p
          WHERE p.participante_id = o.userId AND p.fecha_ingreso <= o.created_at
          ORDER BY p.fecha_ingreso DESC LIMIT 1
       ) asignado
       FROM UserObservations o) x`)) {
    console.log(`   observaciones: ${r.n}, sin proceso por fecha: ${r.sin_asignar}`);
  }
  console.log('   (las que no calcen por fecha caen al proceso mas antiguo del participante)');

  await c.end();
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
