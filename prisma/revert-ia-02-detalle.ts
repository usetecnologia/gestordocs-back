import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** SOLO LECTURA: detalles finos sobre el inventario de la fase 1, para decidir el alcance. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

interface Fila {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  docStatusActual: string;
  docStatusARestaurar: string | null;
  userStatusActual: string;
  userStatusARestaurar: string | null;
  historialesPosteriores: number;
  cambiosEstadoPosteriores: number;
  reversible: boolean;
  motivoExclusion: string | null;
}

async function main() {
  const jsonPath = path.join(process.cwd(), 'reversion-ia', 'inventario.json');
  const { filas } = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { filas: Fila[] };

  console.log('=== 1. ¿Se enviaron correos realmente? ===');
  const totalLogs = await prisma.emailLog.count();
  const porAccion = await prisma.emailLog.groupBy({
    by: ['actionCode', 'status'],
    _count: { _all: true },
    orderBy: { _count: { actionCode: 'desc' } },
    take: 15,
  });
  const ultimo = await prisma.emailLog.findFirst({
    orderBy: { sentAt: 'desc' },
    select: { actionCode: true, status: true, sentAt: true },
  });
  const observadoAlgunaVez = await prisma.emailLog.count({
    where: { actionCode: 'DOCUMENTO_OBSERVADO' },
  });
  console.log(`Filas totales en historial_correos: ${totalLogs}`);
  console.log(`Correos DOCUMENTO_OBSERVADO en toda la historia: ${observadoAlgunaVez}`);
  console.log(`Último correo registrado:`, ultimo);
  console.log('Top acciones registradas:');
  porAccion.forEach((a) =>
    console.log(`   ${a.actionCode} [${a.status}] → ${a._count._all}`),
  );

  console.log('\n=== 2. Participantes que se restaurarían a INACTIVO ===');
  const inactivos = filas.filter((f) => f.userStatusARestaurar === 'INACTIVO');
  inactivos.forEach((f) =>
    console.log(
      `   DNI ${f.dni} | actual: ${f.userStatusActual} → restaurar: INACTIVO | reversible=${f.reversible}`,
    ),
  );

  console.log('\n=== 3. Documentos que YA estaban observados antes de la IA ===');
  const yaObservados = filas.filter((f) => f.docStatusARestaurar === 'OBSERVADO');
  yaObservados.forEach((f) =>
    console.log(`   DNI ${f.dni} | doc ${f.userDocumentId} | reversible=${f.reversible}`),
  );

  console.log('\n=== 4. Documentos cuyo estado previo era SUBIDO (sin revisar aún) ===');
  filas
    .filter((f) => f.docStatusARestaurar === 'SUBIDO')
    .forEach((f) => console.log(`   DNI ${f.dni} | reversible=${f.reversible}`));

  console.log('\n=== 5. Desglose de los conflictos ===');
  const conflictos = filas.filter((f) => !f.reversible);
  const docTocado = conflictos.filter((f) => f.historialesPosteriores > 0);
  const soloEstado = conflictos.filter((f) => f.historialesPosteriores === 0);
  console.log(`Con el DOCUMENTO tocado después (no se puede revertir el documento): ${docTocado.length}`);
  docTocado.forEach((f) => console.log(`   DNI ${f.dni} | doc actual: ${f.docStatusActual}`));
  console.log(`Solo con el ESTADO del participante movido (el documento sigue intacto): ${soloEstado.length}`);
  soloEstado.forEach((f) =>
    console.log(
      `   DNI ${f.dni} | doc: ${f.docStatusActual} → ${f.docStatusARestaurar} | usuario actual: ${f.userStatusActual}`,
    ),
  );

  console.log('\n=== 6. ¿Sigue habiendo actividad en el sistema? ===');
  const desde = new Date('2026-08-04T21:46:43.830Z');
  const [historialesNuevos, estadosNuevos] = await Promise.all([
    prisma.userDocumentHistory.count({ where: { createdAt: { gt: desde } } }),
    prisma.userHistoryStatus.count({ where: { createdAt: { gt: desde } } }),
  ]);
  const ultimoHistorial = await prisma.userDocumentHistory.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true },
  });
  console.log(`Historiales de documentos creados desde el fin de la corrida: ${historialesNuevos}`);
  console.log(`Cambios de estado de participantes desde entonces: ${estadosNuevos}`);
  console.log(`Último historial registrado en el sistema:`, ultimoHistorial);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
