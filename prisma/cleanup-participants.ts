import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

// Ajustar acá si el código/nombre real en tu base difiere.
const KEEP_PROGRAM_CODE = 'WAT USA';
const KEEP_COUNTRY_NAME = 'PERU';
const PARTICIPANT_ROLE_NAME = 'Participante';

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
  const program = await prisma.program.findUnique({ where: { code: KEEP_PROGRAM_CODE } });
  if (!program) throw new Error(`No existe un Program con code = "${KEEP_PROGRAM_CODE}".`);

  const country = await prisma.country.findFirst({ where: { name: KEEP_COUNTRY_NAME } });
  if (!country) throw new Error(`No existe un Country con name = "${KEEP_COUNTRY_NAME}".`);

  const role = await prisma.role.findFirst({ where: { name: PARTICIPANT_ROLE_NAME } });
  if (!role) throw new Error(`No existe un Role con name = "${PARTICIPANT_ROLE_NAME}".`);

  const allParticipants = await prisma.user.findMany({
    where: { roleId: role.id },
    select: { id: true, username: true },
  });

  const keepUsers = await prisma.user.findMany({
    where: { roleId: role.id, programId: program.id, countryId: country.id },
    select: { id: true },
  });
  const keepIds = new Set(keepUsers.map((u) => u.id));

  const usersToDelete = allParticipants.filter((u) => !keepIds.has(u.id));
  const idsToDelete = usersToDelete.map((u) => u.id);

  console.log(`Programa a conservar: ${program.name} (${program.code}) -> ${program.id}`);
  console.log(`País a conservar: ${country.name} -> ${country.id}`);
  console.log(`Rol filtrado: ${role.name} -> ${role.id}`);
  console.log(`Total participantes: ${allParticipants.length}`);
  console.log(`Se mantienen (${program.code} + ${country.name}): ${keepIds.size}`);
  console.log(`Se eliminarían: ${idsToDelete.length}`);

  if (!APPLY) {
    console.log('\nDry-run: no se borró nada. Corré de nuevo con --apply para ejecutar el borrado.');
    return;
  }

  if (idsToDelete.length === 0) {
    console.log('Nada para borrar.');
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

  console.log(`\nListo. Se eliminaron ${idsToDelete.length} participantes y todos sus datos relacionados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
