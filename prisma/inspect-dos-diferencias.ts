import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** SOLO LECTURA: por qué dos participantes no quedaron en el estado restaurado por la reversión. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const DNIS = ['70444426', '76396846'];
/** Momento en que corrió la reversión. */
const REVERSION = new Date('2026-08-05T18:45:00.000Z');

async function main() {
  for (const dni of DNIS) {
    const persona = await prisma.person.findFirst({ where: { dni }, select: { id: true } });
    if (!persona) continue;

    const user = await prisma.user.findUnique({
      where: { id: persona.id },
      select: { status: true },
    });
    console.log(`\n=== DNI ${dni} — estado actual: ${String(user?.status)} ===`);

    const estados = await prisma.userHistoryStatus.findMany({
      where: { userId: persona.id },
      select: { status: true, createdAt: true, createdById: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    console.log('  Últimos cambios de estado:');
    estados.reverse().forEach((e) =>
      console.log(
        `     ${e.createdAt.toISOString().slice(0, 19).replace('T', ' ')} → ${String(e.status)}` +
          `${e.createdAt > REVERSION ? '   ⬅ POSTERIOR A LA REVERSIÓN' : ''}`,
      ),
    );

    const docs = await prisma.userDocumentHistory.findMany({
      where: { userDocuments: { userId: persona.id }, createdAt: { gt: REVERSION } },
      select: { status: true, createdAt: true, createdById: true, userDocumentsId: true },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`  Movimientos de documentos posteriores a la reversión: ${docs.length}`);
    docs.forEach((d) =>
      console.log(
        `     ${d.createdAt.toISOString().slice(0, 19).replace('T', ' ')} → ${String(d.status)} (doc ${d.userDocumentsId.slice(0, 8)}…)`,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
