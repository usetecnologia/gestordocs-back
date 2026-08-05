import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA de los documentos e historial de un participante (por DNI).
 * No escribe nada. Uso: ts-node -r tsconfig-paths/register prisma/inspect-participant-passport.ts <dni>
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const dni = process.argv[2];

async function main() {
  if (!dni) throw new Error('Falta el DNI como argumento.');

  const person = await prisma.person.findFirst({
    where: { dni },
    select: { id: true, dni: true, firstname: true, lastfathername: true },
  });
  if (!person) {
    console.log(`No existe persona con DNI ${dni}`);
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: person.id },
    select: { id: true, email: true, status: true, fechadeenvioalsponsor: true },
  });

  console.log('=== PARTICIPANTE ===');
  console.log({ ...person, status: user?.status, enviadoSponsor: user?.fechadeenvioalsponsor });

  const docs = await prisma.userDocuments.findMany({
    where: { userId: person.id },
    include: {
      documents: { select: { id: true, name: true, siglasCode: true } },
      documentSponsors: {
        select: {
          id: true,
          document: { select: { id: true, name: true, siglasCode: true } },
          sponsor: { select: { code: true, name: true } },
        },
      },
      userDocumentHistory: {
        orderBy: { createdAt: 'asc' },
        include: {
          userDocumentHistoryEtiquetas: { include: { etiquetas: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== USER_DOCUMENTS (${docs.length} filas, TODAS incluidas las inactivas) ===`);
  for (const d of docs) {
    const doc = d.documentSponsors?.document ?? d.documents;
    console.log(
      `\n-- userDocumentId=${d.id}\n   documento: ${doc?.name ?? '?'} (siglas=${doc?.siglasCode ?? '-'})` +
        `\n   via: ${d.documentSponsorId ? `sponsor ${d.documentSponsors?.sponsor?.code ?? '?'}` : 'global (documentId)'}` +
        `\n   status=${d.status}  statusDocument=${d.statusDocument}` +
        `\n   createdAt=${d.createdAt.toISOString()}  updatedAt=${d.updatedAt.toISOString()}` +
        `\n   historial: ${d.userDocumentHistory.length} filas`,
    );
    for (const h of d.userDocumentHistory) {
      const etiquetas = h.userDocumentHistoryEtiquetas.map((e) => e.etiquetas.name).join(', ') || '-';
      console.log(
        `      [${h.createdAt.toISOString()}] status=${h.status} createdById=${h.createdById ?? '-'} ` +
          `etiquetas=[${etiquetas}] url=${h.url ? h.url.slice(-45) : 'NULL'} obs=${(h.observation ?? '').slice(0, 90)}`,
      );
    }
  }

  const hist = await prisma.userHistoryStatus.findMany({
    where: { userId: person.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true, createdById: true, createdAt: true },
  });
  console.log('\n=== USER_HISTORY_STATUS (últimos 10) ===');
  for (const h of hist) {
    console.log(`   [${h.createdAt.toISOString()}] ${h.status}  createdById=${h.createdById ?? '-'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
