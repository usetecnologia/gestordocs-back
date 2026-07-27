import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

// Reconstruye por completo la tabla OptionProgram desde el catálogo de Workuse.
// - Los option programs se consolidan por la combinación (programId, shortDatabase).
//   El catálogo externo trae una fila por (país, programa, shortDatabase); al colapsar los
//   países queda una sola fila por (programa, shortDatabase) — ej. un único "CON" por programa.
// - programId del catálogo es un ID EXTERNO: se resuelve contra la BD por idExterno.
// - Los option programs cuyo programa no exista localmente se OMITEN (no se pueden crear sin su FK).
// - Solo toca la tabla OptionProgram. NO borra usuarios, historiales ni ninguna otra tabla.
//   (Al borrar OptionProgram, la FK User.optionProgramId queda en NULL por ON DELETE SET NULL:
//    es una actualización de columna en User, no un borrado de filas.)

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

  // 2. Mapa idExterno -> id local del programa (para resolver el FK program).
  const programs = await prisma.program.findMany({ select: { id: true, idExterno: true } });
  const programByExt = new Map(
    programs.filter((p) => p.idExterno?.trim()).map((p) => [p.idExterno!.trim(), p.id]),
  );

  // 3. Consolidar por (programId, shortDatabase). Se deduplica: varias filas externas de
  //    distintos países caen en la misma fila consolidada.
  const rowByKey = new Map<string, { shortDatabase: string; programId: string; status: boolean }>();
  const skipped: { id: number; description: string; programId: number }[] = [];

  for (const op of catalog) {
    const programId = programByExt.get(String(op.programId));
    if (!programId) {
      skipped.push({ id: op.id, description: op.description, programId: op.programId });
      continue;
    }
    const shortDatabase = String(op.short_Database).trim().toUpperCase();
    const key = `${programId}::${shortDatabase}`;
    if (!rowByKey.has(key)) {
      rowByKey.set(key, { shortDatabase, programId, status: true });
    }
  }
  const rows = [...rowByKey.values()];

  // 4. Estado actual (solo informativo).
  const currentCount = await prisma.optionProgram.count();
  const usersLinked = await prisma.user.count({ where: { optionProgramId: { not: null } } });

  console.log(`\nEstado actual en BD:`);
  console.log(`  OptionProgram existentes (se ${APPLY ? 'BORRARÁN' : 'borrarían'}): ${currentCount}`);
  console.log(`  Usuarios con optionProgramId (quedarán en NULL hasta su próximo login): ${usersLinked}`);
  console.log(`\nReconstrucción consolidada:`);
  console.log(`  Filas del catálogo procesadas: ${catalog.length}`);
  console.log(`  A crear (consolidadas por programa + shortDatabase): ${rows.length}`);
  console.log(`  Omitidas (programa inexistente localmente): ${skipped.length}`);
  if (skipped.length) {
    for (const s of skipped) {
      console.log(`    - id ${s.id} "${s.description}" (programId ext=${s.programId})`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run: no se borró ni creó nada. Corré de nuevo con --apply para ejecutar.');
    return;
  }

  // 5. Aplicar: borrar TODO OptionProgram y recrear consolidado, en una sola transacción.
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
