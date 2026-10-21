/**
 * Crea el usuario de sistema "Revisión IA", a cuyo nombre la revisión automática registra las
 * aprobaciones, observaciones y cambios de estado. Así el historial distingue qué hizo la IA y
 * qué hizo una persona.
 *
 * No tiene contraseña ni persona asociada: no puede iniciar sesión ni por login ni por autologin.
 * Es idempotente: si el usuario ya existe, no hace nada.
 *
 *   npx ts-node -r tsconfig-paths/register prisma/seed-ai-reviewer.ts
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { AI_REVIEWER_USERNAME } from '../src/modules/user-documents/domain/ai-review.constants';

const ROLE_NAME = 'Administrador';

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log(`Base: ${process.env.DATABASE_DB}`);

  const existing = await prisma.user.findFirst({ where: { username: AI_REVIEWER_USERNAME } });
  if (existing) {
    console.log(`Ya existe el usuario "${AI_REVIEWER_USERNAME}" (${existing.id}). No se hace nada.`);
    return;
  }

  const role = await prisma.role.findFirst({ where: { name: ROLE_NAME } });
  if (!role) throw new Error(`No existe el rol "${ROLE_NAME}".`);

  const user = await prisma.user.create({
    data: { username: AI_REVIEWER_USERNAME, email: null, password: null, roleId: role.id },
  });
  console.log(`Creado el usuario "${AI_REVIEWER_USERNAME}" (${user.id}) con rol ${ROLE_NAME}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
