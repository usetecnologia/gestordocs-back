import 'dotenv/config';
import * as fs from 'fs';
import * as mariadb from 'mariadb';

/**
 * Ensayo del backfill de `procesos` (M3). Corre el SQL real de la migracion dentro de una
 * transaccion, verifica el resultado y hace rollback: la base queda como estaba. Sirve para
 * validar la migracion contra una base nueva — en produccion los conteos son otros y los
 * resultados limpios de testdocs no valen alla.
 *
 * Corrido DESPUES de aplicar la migracion insertaria 0 filas por el NOT EXISTS, y las mismas
 * verificaciones funcionan como comprobacion posterior.
 */

const SQL = fs.readFileSync('prisma/migrations/20260824120000_backfill_procesos/migration.sql', 'utf8');

(async () => {
  const c = await mariadb.createConnection({
    host: process.env.HOST_DB!, user: process.env.USER_DB!, password: process.env.PASSWORD_DB!,
    database: process.env.DATABASE_DB!, port: Number(process.env.PORT_DB ?? 3306),
  });
  const q = async (s: string, p: any[] = []) => (await c.query(s, p)) as any[];
  const n = async (s: string, p: any[] = []) => Number((await q(s, p))[0].n);

  await c.beginTransaction();
  try {
    const res: any = await c.query(SQL);
    console.log('filas insertadas:', Number(res.affectedRows));

    console.log('\n-- verificaciones dentro de la transaccion --');
    console.log('  procesos                        ', await n('SELECT COUNT(*) n FROM procesos'));
    console.log('  abiertos (activo = 1)           ', await n('SELECT COUNT(*) n FROM procesos WHERE activo = 1'));
    console.log('  participantes distintos         ', await n('SELECT COUNT(DISTINCT participante_id) n FROM procesos'));
    console.log('  estado <> EN_PROCESO            ', await n("SELECT COUNT(*) n FROM procesos WHERE estado <> 'EN_PROCESO'"));
    console.log('  activo distinto de 1            ', await n('SELECT COUNT(*) n FROM procesos WHERE activo IS NOT TRUE'));
    console.log('  participantes SIN proceso       ', await n(
      `SELECT COUNT(*) n FROM User u JOIN Role r ON r.id = u.role_id
        WHERE r.code = 'PARTICIPANTE'
          AND NOT EXISTS (SELECT 1 FROM procesos p WHERE p.participante_id = u.id)`));
    console.log('  procesos de NO participantes    ', await n(
      `SELECT COUNT(*) n FROM procesos p JOIN User u ON u.id = p.participante_id
        JOIN Role r ON r.id = u.role_id WHERE r.code <> 'PARTICIPANTE'`));

    console.log('\n  campos que no coinciden con User (deben ser 0):');
    const desajustes: Array<[string, string]> = [
      ['programa', 'p.program_id <> u.programId'],
      ['opcion', 'p.option_program_id <> u.optionProgramId'],
      ['pais', 'p.country_id <> u.countryId'],
      ['sponsor', 'NOT (p.sponsor_id <=> u.sponsorId)'],
      ['status_documental', 'p.status_documental <> u.status'],
      ['fecha_ingreso', 'p.fecha_ingreso <> u.created_at'],
    ];
    for (const [etiq, cond] of desajustes) {
      console.log(`    ${etiq.padEnd(20)}`, await n(
        `SELECT COUNT(*) n FROM procesos p JOIN User u ON u.id = p.participante_id WHERE ${cond}`));
    }

    console.log('\n  sponsor NULL                    ', await n('SELECT COUNT(*) n FROM procesos WHERE sponsor_id IS NULL'));
    console.log('  finalizado_at / by no nulos     ', await n(
      'SELECT COUNT(*) n FROM procesos WHERE finalizado_at IS NOT NULL OR finalizado_by_id IS NOT NULL'));
    console.log('  id no es UUID v4                ', await n(
      "SELECT COUNT(*) n FROM procesos WHERE id NOT REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'"));
    console.log('  ids duplicados                  ', await n(
      'SELECT COUNT(*) n FROM (SELECT id FROM procesos GROUP BY id HAVING COUNT(*) > 1) x'));

    console.log('\n  temporada asignada:');
    for (const r of await q(
      `SELECT COALESCE(t.name, '(NULL)') temporada, pr.name programa, COUNT(*) n
         FROM procesos p JOIN Program pr ON pr.id = p.program_id
         LEFT JOIN Temporada t ON t.id = p.temporada_id
        GROUP BY temporada, programa ORDER BY n DESC`)) {
      console.log(`    ${String(r.n).padStart(5)}  ${r.programa.padEnd(24)} ${r.temporada}`);
    }

    console.log('\n  status_documental:');
    for (const r of await q(
      'SELECT status_documental s, COUNT(*) n FROM procesos GROUP BY s ORDER BY n DESC')) {
      console.log(`    ${String(r.n).padStart(5)}  ${r.s}`);
    }

    console.log('\n-- prueba de la unicidad: un segundo proceso abierto para el mismo participante --');
    const victima = (await q('SELECT participante_id, program_id, option_program_id, country_id FROM procesos LIMIT 1'))[0];
    try {
      await c.query(
        `INSERT INTO procesos (id, participante_id, program_id, option_program_id, country_id, activo, updated_at)
         VALUES (UUID_v4(), ?, ?, ?, ?, 1, CURRENT_TIMESTAMP(3))`,
        [victima.participante_id, victima.program_id, victima.option_program_id, victima.country_id]);
      console.log('  ⚠️  ACEPTADO — la unicidad no esta protegiendo');
    } catch (e: any) {
      console.log('  rechazado correctamente:', e.code);
    }
  } finally {
    await c.rollback();
    console.log('\n-- rollback --');
    console.log('  procesos tras rollback          ', await n('SELECT COUNT(*) n FROM procesos'));
    await c.end();
  }
})().catch((e) => { console.error('ERROR:', e.code ?? '', e.message); process.exit(1); });
