import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

const TARGET_STATUS_EXTERNAL = 'Registered';

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
  const usersToDelete = await prisma.user.findMany({
    where: { statusExternal: TARGET_STATUS_EXTERNAL },
    select: { id: true, username: true, email: true, statusExternal: true, status: true },
  });
  const idsToDelete = usersToDelete.map((u) => u.id);

  console.log(`statusExternal buscado: "${TARGET_STATUS_EXTERNAL}"`);
  console.log(`Usuarios encontrados: ${idsToDelete.length}`);

  if (idsToDelete.length === 0) {
    console.log('Nada para borrar.');
    return;
  }

  console.log('\nMuestra (hasta 10):');
  console.table(usersToDelete.slice(0, 10));

  if (!APPLY) {
    console.log('\nDry-run: no se borró nada. Corré de nuevo con --apply para ejecutar el borrado.');
    return;
  }

  const userDocs = await prisma.userDocuments.findMany({
    where: { userId: { in: idsToDelete } },
    select: { id: true },
  });
  const userDocIds = userDocs.map((d) => d.id);

  const histories = await prisma.userDocumentHistory.findMany({
    where: { userDocumentsId: { in: userDocIds } },
    select: { id: true },
  });
  const historyIds = histories.map((h) => h.id);

  const observations = await prisma.userObservations.findMany({
    where: { userId: { in: idsToDelete } },
    select: { id: true },
  });
  const observationIds = observations.map((o) => o.id);

  await prisma.$transaction([
    // Desvincular referencias de auditoría (createdBy/updatedBy) sin borrar los registros compartidos
    prisma.documents.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),
    prisma.documents.updateMany({ where: { updatedById: { in: idsToDelete } }, data: { updatedById: null } }),
    prisma.documentSponsor.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),
    prisma.documentSponsor.updateMany({ where: { updatedById: { in: idsToDelete } }, data: { updatedById: null } }),
    prisma.etiquetas.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),
    prisma.etiquetas.updateMany({ where: { updatedById: { in: idsToDelete } }, data: { updatedById: null } }),
    prisma.userObservations.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),
    prisma.userDocumentHistory.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),
    prisma.userHistoryStatus.updateMany({ where: { createdById: { in: idsToDelete } }, data: { createdById: null } }),

    // Hijos de UserDocumentHistory -> UserDocuments
    prisma.userDocumentObservationFiles.deleteMany({ where: { userDocumentHistoryId: { in: historyIds } } }),
    prisma.userDocumentHistoryEtiquetas.deleteMany({ where: { userDocumentHistoryId: { in: historyIds } } }),
    prisma.userDocumentHistory.deleteMany({ where: { id: { in: historyIds } } }),
    prisma.userDocuments.deleteMany({ where: { id: { in: userDocIds } } }),

    // Hijos de UserObservations
    prisma.userObservationFiles.deleteMany({ where: { userObservationId: { in: observationIds } } }),
    prisma.userObservationEtiquetas.deleteMany({ where: { userObservationId: { in: observationIds } } }),
    prisma.userObservations.deleteMany({ where: { id: { in: observationIds } } }),

    // Historial de estados
    prisma.userHistoryStatus.deleteMany({ where: { userId: { in: idsToDelete } } }),

    // Usuario y persona
    prisma.user.deleteMany({ where: { id: { in: idsToDelete } } }),
    prisma.person.deleteMany({ where: { id: { in: idsToDelete } } }),
  ]);

  console.log(`\nListo. Se eliminaron ${idsToDelete.length} participantes con statusExternal="${TARGET_STATUS_EXTERNAL}" y todos sus datos relacionados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
