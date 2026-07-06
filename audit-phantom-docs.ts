import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './prisma/generated/prisma/client';

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB as string,
  user: process.env.USER_DB as string,
  password: process.env.PASSWORD_DB as string,
  database: process.env.DATABASE_DB as string,
  port: Number(process.env.PORT_DB),
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });

const RANK: Record<string, number> = {
  PENDIENTE: 0,
  SUBIDO: 1,
  EN_REVISION: 1,
  OBSERVADO: 2,
  REVISADO: 2,
};

async function main() {
  // 1. Documentos con al menos un vínculo activo a sponsor
  const sponsorScopedDocs = await prisma.documents.findMany({
    where: { documentSponsors: { some: { status: true } } },
    select: {
      id: true,
      siglasCode: true,
      name: true,
      documentSponsors: {
        where: { status: true },
        select: { id: true, sponsor: { select: { code: true } } },
      },
    },
  });
  const docMap = new Map(sponsorScopedDocs.map((d) => [d.id, d]));

  // 2. Filas "fantasma": documentId set (no documentSponsorId) apuntando a uno de esos documentos
  const phantoms = await prisma.userDocuments.findMany({
    where: { documentId: { in: [...docMap.keys()] }, documentSponsorId: null },
    include: {
      userDocumentHistory: { orderBy: { createdAt: 'desc' } },
      users: { select: { id: true, sponsor: { select: { code: true } } } },
    },
  });

  console.log(`Total filas fantasma candidatas: ${phantoms.length}\n`);

  const categorized = {
    safeDeleteRedundant: [] as string[],
    safeDeleteNotApplicable: [] as string[],
    migrateIntoExisting: [] as string[],
    createCorrectAndMigrate: [] as string[],
    manualReview: [] as string[],
  };

  for (const p of phantoms) {
    const doc = docMap.get(p.documentId!)!;
    const sponsorCode = p.users.sponsor?.code ?? null;
    const matchingDs = doc.documentSponsors.find((ds) => ds.sponsor.code === sponsorCode);

    const line = `  userDoc=${p.id} user=${p.userId} doc=${doc.siglasCode}(${doc.name}) phantomStatus=${p.status} statusDocument=${p.statusDocument} sponsorCode=${sponsorCode ?? 'NONE'}`;

    if (!matchingDs) {
      categorized.safeDeleteNotApplicable.push(`${line} -> no aplica a ningún sponsor de este documento`);
      continue;
    }

    const correct = await prisma.userDocuments.findFirst({
      where: { userId: p.userId, documentSponsorId: matchingDs.id },
    });

    if (!correct) {
      categorized.createCorrectAndMigrate.push(
        `${line} -> falta fila correcta (documentSponsorId=${matchingDs.id}), crear y migrar`,
      );
      continue;
    }

    const phantomRank = RANK[p.status] ?? -1;
    const correctRank = RANK[correct.status] ?? -1;

    if (correct.status === 'PENDIENTE' && p.status !== 'PENDIENTE') {
      categorized.migrateIntoExisting.push(
        `${line} -> correcta(id=${correct.id}) sigue PENDIENTE, migrar progreso del fantasma`,
      );
    } else if (phantomRank > correctRank) {
      categorized.manualReview.push(
        `${line} -> correcta(id=${correct.id}, status=${correct.status}) tiene rank menor pero no PENDIENTE, revisar manualmente`,
      );
    } else {
      categorized.safeDeleteRedundant.push(
        `${line} -> correcta(id=${correct.id}, status=${correct.status}) ya cubre o supera el progreso, borrar fantasma`,
      );
    }
  }

  for (const [key, lines] of Object.entries(categorized)) {
    console.log(`\n=== ${key} (${lines.length}) ===`);
    for (const l of lines) console.log(l);
  }
}

main().finally(() => prisma.$disconnect());
