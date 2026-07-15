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

  // 3. Acciones de correo
  // Por ahora solo DOCUMENTO_OBSERVADO está activa (ver TerminarRevisionUseCase: dispara un
  // único correo por revisión, no uno por cada documento observado). El resto queda en el
  // catálogo pero inactiva hasta que se confirme su lógica de envío.
  const ACTIVE_EMAIL_ACTION_CODE = 'DOCUMENTO_OBSERVADO';

  const emailActions: Array<{ name: string; code: string }> = [
    { name: 'Documento subido por el participante', code: 'DOCUMENTO_SUBIDO' },
    { name: 'Documento con estado observado', code: 'DOCUMENTO_OBSERVADO' },
    { name: 'Documento revisado/aprobado', code: 'DOCUMENTO_APROBADO' },
    { name: 'Documentos incompletos', code: 'PARTICIPANTE_DOCUMENTOS_INCOMPLETOS' },
    { name: 'Pendiente de revisión', code: 'PARTICIPANTE_PENDIENTE_REVISION' },
    { name: 'Participante observado', code: 'PARTICIPANTE_OBSERVADO' },
    { name: 'En preparación', code: 'PARTICIPANTE_EN_PREPARACION' },
    { name: 'Enviado al sponsor', code: 'PARTICIPANTE_ENVIADO_SPONSOR' },
    { name: 'Observado por el sponsor', code: 'PARTICIPANTE_OBSERVADO_SPONSOR' },
    { name: 'Rechazado por el sponsor', code: 'PARTICIPANTE_RECHAZADO_SPONSOR' },
    { name: 'Aprobado por el sponsor', code: 'PARTICIPANTE_APROBADO_SPONSOR' },
    { name: 'DS-2019 emitido', code: 'PARTICIPANTE_DS2019_EMITIDO' },
    { name: 'Participante retirado', code: 'PARTICIPANTE_RETIRADO' },
    { name: 'Bienvenida al participante', code: 'BIENVENIDA_PARTICIPANTE' },
    { name: 'Recuperación de contraseña', code: 'RECUPERACION_CONTRASENA' },
  ];

  for (const action of emailActions) {
    const status = action.code === ACTIVE_EMAIL_ACTION_CODE;
    await prisma.emailAction.upsert({
      where: { code: action.code },
      update: { name: action.name, status },
      create: { name: action.name, code: action.code, status },
    });
  }
  console.log(`✔ Acciones de correo: ${emailActions.length} sincronizadas`);

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
