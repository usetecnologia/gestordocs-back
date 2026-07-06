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

async function main() {
  const sponsorScopedDocs = await prisma.documents.findMany({
    where: { documentSponsors: { some: { status: true } } },
    select: { id: true },
  });
  const ids = sponsorScopedDocs.map((d) => d.id);

  const phantoms = await prisma.userDocuments.findMany({
    where: { documentId: { in: ids }, documentSponsorId: null },
    select: { createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log('count:', phantoms.length);
  console.log('earliest createdAt:', phantoms[0]?.createdAt);
  console.log('latest createdAt:', phantoms[phantoms.length - 1]?.createdAt);

  const byDay = new Map<string, number>();
  for (const p of phantoms) {
    const day = p.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  console.log([...byDay.entries()].sort());
}
main().finally(() => prisma.$disconnect());
