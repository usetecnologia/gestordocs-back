import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** Inspección SOLO LECTURA: quién es el autor de las escrituras de la corrida del 7/8/2026. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const AUTORES = [
  'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d', // autor de la corrida (y del cron diario)
  'fe52eded-04a3-48d2-8c32-dc5dba5429aa', // usó la etiqueta IA a mano el 5/8
  '28f747e6-27fe-4c53-9a4d-ca1e390b5953', // usó la etiqueta IA a mano el 7/8
];

async function main() {
  const users = await prisma.user.findMany({
    where: { id: { in: AUTORES } },
    select: { id: true, email: true, username: true, status: true, role: { select: { name: true } } },
  });
  const personas = await prisma.person.findMany({
    where: { id: { in: AUTORES } },
    select: { id: true, dni: true, firstname: true, lastfathername: true },
  });
  const nombre = new Map(
    personas.map((p) => [p.id, `${p.firstname ?? ''} ${p.lastfathername ?? ''}`.trim()]),
  );

  console.table(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      rol: u.role?.name,
      nombre: nombre.get(u.id) ?? '(sin Person)',
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
