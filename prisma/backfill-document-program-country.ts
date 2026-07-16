import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

// Ajustar acá si el código/nombre real en tu base difiere.
const PROGRAM_CODE = 'WAT USA';
const COUNTRY_NAME = 'PERU';

const APPLY = process.argv.includes('--apply');

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const program = await prisma.program.findUnique({ where: { code: PROGRAM_CODE } });
  if (!program) throw new Error(`No existe un Program con code = "${PROGRAM_CODE}".`);

  const country = await prisma.country.findFirst({ where: { name: COUNTRY_NAME } });
  if (!country) throw new Error(`No existe un Country con name = "${COUNTRY_NAME}".`);

  console.log(`Programa: ${program.name} (${program.code}) -> ${program.id}`);
  console.log(`País: ${country.name} -> ${country.id}`);
  console.log(`Modo: ${APPLY ? 'APLICAR CAMBIOS' : 'dry-run (sin escribir nada)'}\n`);

  const documents = await prisma.documents.findMany({
    select: { id: true, name: true, title: true, instructions: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Documentos encontrados: ${documents.length}\n`);

  let created = 0;
  let alreadyLinked = 0;
  let skippedNoTitle = 0;

  for (const doc of documents) {
    // Título/descripción general del documento -> se copian tal cual al grupo programa+país.
    const title = doc.title?.trim() || doc.name;
    const description = doc.instructions?.trim() ?? '';

    if (!title) {
      console.log(`⚠ Documento ${doc.id} sin título ni nombre utilizable. Se omite (no se crea nada).`);
      skippedNoTitle++;
      continue;
    }

    const existingDocumentProgram = await prisma.documentProgram.findUnique({
      where: { documentId_programId: { documentId: doc.id, programId: program.id } },
    });

    if (existingDocumentProgram) {
      const existingLink = await prisma.documentProgramDescriptionCountry.findUnique({
        where: {
          documentProgramId_countryId: {
            documentProgramId: existingDocumentProgram.id,
            countryId: country.id,
          },
        },
      });
      if (existingLink) {
        console.log(
          `- "${doc.name}" (${doc.id}) ya tiene un grupo de descripción para ${PROGRAM_CODE} + ${COUNTRY_NAME}. Se omite (no se toca ni se duplica).`,
        );
        alreadyLinked++;
        continue;
      }
    }

    console.log(
      `+ "${doc.name}" (${doc.id}): se ${APPLY ? 'creará' : 'crearía'} un grupo título="${title}" para ${PROGRAM_CODE} + ${COUNTRY_NAME}` +
        (existingDocumentProgram ? ' (el documento ya tiene otros grupos/países bajo este programa; no se tocan).' : '.'),
    );

    if (!APPLY) {
      created++;
      continue;
    }

    // Solo INSERTs. Nunca se actualiza ni se borra un DocumentProgram/Description/Country existente,
    // ni se toca documents/userDocuments/historial de ningún tipo.
    await prisma.$transaction(async (tx) => {
      const documentProgram =
        existingDocumentProgram ??
        (await tx.documentProgram.create({
          data: { documentId: doc.id, programId: program.id, status: true },
        }));

      const order = await tx.documentProgramDescription.count({
        where: { documentProgramId: documentProgram.id },
      });

      const documentProgramDescription = await tx.documentProgramDescription.create({
        data: { documentProgramId: documentProgram.id, title, description, order },
      });

      await tx.documentProgramDescriptionCountry.create({
        data: {
          documentProgramDescriptionId: documentProgramDescription.id,
          documentProgramId: documentProgram.id,
          countryId: country.id,
        },
      });
    });

    created++;
  }

  console.log(`\nResumen:`);
  console.log(`  ${APPLY ? 'Creados' : 'A crear'}: ${created}`);
  console.log(`  Ya vinculados (sin cambios): ${alreadyLinked}`);
  console.log(`  Omitidos por falta de título/nombre: ${skippedNoTitle}`);

  if (!APPLY) {
    console.log('\nDry-run: no se creó ni se modificó nada. Corré de nuevo con --apply para ejecutar.');
  } else {
    console.log('\nListo. Solo se insertaron filas nuevas — no se modificó ni eliminó ningún dato existente.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
