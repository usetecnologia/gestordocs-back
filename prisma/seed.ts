import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Roles
  const adminRole = await prisma.role.upsert({
    where: { code: 'ADMIN' },
    update: {},
    create: {
      name: 'Administrador',
      code: 'ADMIN',
      isSystem: true,
    },
  });
  console.log(`✔ Role: ${adminRole.name} (${adminRole.id})`);

  const participanteRole = await prisma.role.upsert({
    where: { code: 'PARTICIPANTE' },
    update: {},
    create: {
      name: 'Participante',
      code: 'PARTICIPANTE',
      isSystem: true,
    },
  });
  console.log(`✔ Role: ${participanteRole.name} (${participanteRole.id})`);

  // 2. Usuario administrador (Person + User comparten el mismo UUID)
  const userId = randomUUID();
  const hashedPassword = await bcrypt.hash('password26', 12);

  const existingUser = await prisma.user.findFirst({ where: { username: 'usedocs' } });

  if (!existingUser) {
    await prisma.$transaction([
      prisma.person.create({
        data: {
          id: userId,
          firstname: 'USE',
          lastfathername: 'Administrador',
        },
      }),
      prisma.user.create({
        data: {
          id: userId,
          username: 'usedocs',
          password: hashedPassword,
          roleId: adminRole.id,
          status: 'ACTIVO',
        },
      }),
    ]);
    console.log(`✔ User: usedocs (${userId})`);
  } else {
    console.log(`⚠ User usedocs already exists, skipping.`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
