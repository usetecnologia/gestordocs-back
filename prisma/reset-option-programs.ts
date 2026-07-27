import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

// Reconstruye por completo la tabla OptionProgram desde el catálogo de Workuse.
// - Solo toca la tabla OptionProgram. NO borra usuarios, historiales ni ninguna otra tabla.
//   (Al borrar OptionProgram, la FK User.optionProgramId queda en NULL por regla ON DELETE SET NULL:
//    es una actualización de columna en User, no un borrado de filas de usuario ni de historial.)
// - countryId / programId del catálogo son IDs EXTERNOS: se resuelven contra la BD por idExterno.
// - Los option programs cuyo país o programa no exista localmente se OMITEN (no se pueden crear sin su FK).

const GENERICS_URL = 'https://secure.workuse.com/api/util/genericos.php';
const APPLY = process.argv.includes('--apply');

interface WorkuseOptionProgram {
  id: number;
  short: string;
  short_Database: string;
  description: string;
  countryId: number;
  programId: number;
}

interface WorkuseGenerics {
  optionPrograms: WorkuseOptionProgram[];
}

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Modo: ${APPLY ? 'APLICAR CAMBIOS' : 'dry-run (sin escribir nada)'}\n`);

  // 1. Traer catálogo externo.
  const res = await fetch(GENERICS_URL);
  if (!res.ok) throw new Error(`Workuse respondió ${res.status} al pedir los genéricos.`);
  const generics = (await res.json()) as WorkuseGenerics;
  const catalog = generics.optionPrograms ?? [];
  console.log(`Option programs en el catálogo externo: ${catalog.length}`);

  // 2. Mapas idExterno -> id local (para resolver los FKs country/program).
  const [countries, programs] = await Promise.all([
    prisma.country.findMany({ select: { id: true, idExterno: true } }),
    prisma.program.findMany({ select: { id: true, idExterno: true } }),
  ]);
  const countryByExt = new Map(
    countries.filter((c) => c.idExterno?.trim()).map((c) => [c.idExterno!.trim(), c.id]),
  );
  const programByExt = new Map(
    programs.filter((p) => p.idExterno?.trim()).map((p) => [p.idExterno!.trim(), p.id]),
  );

  // 3. Construir las filas válidas y registrar las que se omiten.
  const rows: {
    idExterno: string;
    name: string;
    shortName: string;
    shortDatabase: string;
    countryId: string;
    programId: string;
    sponsorId: null;
    status: boolean;
    hideJobFair: boolean;
  }[] = [];
  const skipped: { id: number; description: string; countryId: number; programId: number }[] = [];

  for (const op of catalog) {
    const countryId = countryByExt.get(String(op.countryId));
    const programId = programByExt.get(String(op.programId));
    if (!countryId || !programId) {
      skipped.push({ id: op.id, description: op.description, countryId: op.countryId, programId: op.programId });
      continue;
    }
    const name = op.description.trim();
    const shortName = (name.split(/[\s(]/)[0] || name).slice(0, 50);
    rows.push({
      idExterno: String(op.id),
      name,
      shortName,
      shortDatabase: String(op.short_Database).trim().toUpperCase(),
      countryId,
      programId,
      sponsorId: null,
      status: true,
      hideJobFair: false,
    });
  }

  // 4. Estado actual (solo informativo).
  const currentCount = await prisma.optionProgram.count();
  const usersLinked = await prisma.user.count({ where: { optionProgramId: { not: null } } });

  console.log(`\nEstado actual en BD:`);
  console.log(`  OptionProgram existentes (se ${APPLY ? 'BORRARÁN' : 'borrarían'}): ${currentCount}`);
  console.log(`  Usuarios con optionProgramId (quedarán en NULL hasta su próximo login): ${usersLinked}`);
  console.log(`\nReconstrucción:`);
  console.log(`  A crear: ${rows.length}`);
  console.log(`  Omitidos (país/programa inexistente localmente): ${skipped.length}`);
  if (skipped.length) {
    for (const s of skipped) {
      console.log(`    - id ${s.id} "${s.description}" (countryId ext=${s.countryId}, programId ext=${s.programId})`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run: no se borró ni creó nada. Corré de nuevo con --apply para ejecutar.');
    return;
  }

  // 5. Aplicar: borrar TODO OptionProgram y recrear, en una sola transacción.
  //    createMany genera los UUID (@default(uuid)) y las fechas por defecto automáticamente.
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.optionProgram.deleteMany({});
    const inserted = await tx.optionProgram.createMany({ data: rows });
    return { deleted: deleted.count, inserted: inserted.count };
  });

  console.log(`\n✅ Listo.`);
  console.log(`  Borrados: ${result.deleted}`);
  console.log(`  Creados: ${result.inserted}`);
  console.log(`  Omitidos: ${skipped.length}`);
  console.log(`\nSolo se modificó la tabla OptionProgram (y la columna User.optionProgramId por ON DELETE SET NULL).`);
  console.log(`Ningún usuario, historial u otra tabla fue eliminado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
