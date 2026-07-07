import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

const DOCUMENT_ID = '8a53c5ae-c963-422b-9e2d-8157c9f1b864';
const NEW_STATUS = 'REVISADO';

const APPLY = process.argv.includes('--apply');
const dnis = process.argv.slice(2).filter((arg) => arg !== '--apply');

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  if (!dnis.length) {
    throw new Error(
      'Debes pasar al menos un DNI. Uso: ts-node -r tsconfig-paths/register prisma/update-document-status-by-dni.ts <dni1> <dni2> ... [--apply]',
    );
  }

  console.log(`Documento a actualizar: ${DOCUMENT_ID}`);
  console.log(`Nuevo status: ${NEW_STATUS}`);
  console.log(`DNIs recibidos (${dnis.length}): ${dnis.join(', ')}\n`);

  const persons = await prisma.person.findMany({
    where: { dni: { in: dnis } },
    select: { id: true, dni: true, firstname: true, lastfathername: true },
  });
  const personByDni = new Map(persons.map((p) => [p.dni, p]));

  const notFoundDnis = dnis.filter((dni) => !personByDni.has(dni));
  if (notFoundDnis.length) {
    console.log(`⚠ DNIs sin persona/usuario encontrado (${notFoundDnis.length}): ${notFoundDnis.join(', ')}`);
  }

  const userIds = persons.map((p) => p.id);
  if (!userIds.length) {
    console.log('\nNo hay usuarios válidos para procesar. Nada que hacer.');
    return;
  }

  const userDocs = await prisma.userDocuments.findMany({
    where: { userId: { in: userIds }, documentId: DOCUMENT_ID },
    select: { id: true, userId: true, status: true },
  });
  const userIdsWithDoc = new Set(userDocs.map((d) => d.userId));

  const missing = persons.filter((p) => !userIdsWithDoc.has(p.id));
  if (missing.length) {
    console.log(`\n⚠ Personas sin fila UserDocuments para este documento (${missing.length}):`);
    for (const p of missing) {
      console.log(`  - DNI ${p.dni} (${p.firstname} ${p.lastfathername}) -> userId=${p.id}`);
    }
  }

  console.log(`\nFilas UserDocuments a actualizar a ${NEW_STATUS} (${userDocs.length}):`);
  for (const doc of userDocs) {
    const person = persons.find((p) => p.id === doc.userId);
    console.log(
      `  - DNI ${person?.dni} (${person?.firstname} ${person?.lastfathername}) userDoc=${doc.id} status actual=${doc.status} -> ${NEW_STATUS}`,
    );
  }

  if (!APPLY) {
    console.log('\nDry-run: no se aplicó ningún cambio. Corré de nuevo con --apply al final para ejecutar la actualización.');
    return;
  }

  if (!userDocs.length) {
    console.log('\nNada para actualizar.');
    return;
  }

  await prisma.$transaction(
    userDocs.flatMap((doc) => [
      prisma.userDocuments.update({
        where: { id: doc.id },
        data: { status: NEW_STATUS },
      }),
      prisma.userDocumentHistory.create({
        data: { userDocumentsId: doc.id, status: NEW_STATUS },
      }),
    ]),
  );

  console.log(`\nListo. Se actualizaron ${userDocs.length} UserDocuments a ${NEW_STATUS} y se creó su historial.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
