import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * SOLO LECTURA: ¿pudo la corrida IA enviar correos a los participantes?
 *
 * dispatchByActionCode sale sin registrar nada si la acción está inactiva o si no hay plantilla
 * activa asociada. Que no haya filas en historial_correos no basta para afirmar que no se envió
 * nada: hay que comprobar la configuración.
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const accion = await prisma.emailAction.findUnique({
    where: { code: 'DOCUMENTO_OBSERVADO' },
    select: { id: true, name: true, code: true, status: true },
  });
  console.log('Acción DOCUMENTO_OBSERVADO:', accion ?? '(no existe)');

  if (accion) {
    const plantillas = await prisma.emailTemplate.findMany({
      where: { actionId: accion.id },
      select: { id: true, code: true, name: true, status: true, type: true },
    });
    console.log(`Plantillas asociadas (${plantillas.length}):`);
    plantillas.forEach((p) =>
      console.log(`   ${p.code} | tipo=${p.type} | activa=${p.status}`),
    );
    console.log(
      '\n=> Se envía correo solo si la acción está activa Y existe una plantilla activa.',
    );
  }

  const enVentana = await prisma.emailLog.findMany({
    where: { sentAt: { gte: new Date('2026-08-04T17:00:00Z') } },
    select: { actionCode: true, status: true, sentAt: true, recipientEmail: true },
    orderBy: { sentAt: 'asc' },
  });
  console.log(`\nCorreos registrados desde el inicio de la corrida: ${enVentana.length}`);
  enVentana.forEach((e) => console.log('  ', e));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
