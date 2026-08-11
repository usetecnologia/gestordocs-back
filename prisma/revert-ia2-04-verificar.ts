import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 4 — Verificación posterior a la reversión de la corrida del 7/8/2026.
 *
 * SOLO LECTURA. Comprueba contra la base, fila por fila, que la reversión hizo lo que dice haber
 * hecho. No se fía del código de salida del script de aplicación: en la reversión del 5/8 el proceso
 * terminó el trabajo y luego se quedó colgado, así que la única prueba válida es leer la base.
 *
 * Contrasta los logs de APPLY (`revert-ia2-03-aplicado-*.json`) contra el estado real:
 *   1. que los historiales de la IA y sus etiquetas ya no existan
 *   2. que las filas de UserHistoryStatus de la corrida ya no existan
 *   3. que cada documento haya quedado en el status previo
 *   4. que cada participante haya quedado en el estado previo
 *   5. que lo único que sobrevive con la firma de la corrida sean los excluidos y omitidos
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia2-04-verificar.ts
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';
const AUTOR_CORRIDA = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';
const VENTANA_INICIO = new Date('2026-08-08T01:20:00Z');
const VENTANA_FIN = new Date('2026-08-08T04:44:00Z');
const OBSERVACIONES_TOTALES_CORRIDA = 371;

interface ResultadoAplicado {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  historialIaId: string;
  historialEstadoIaId: string | null;
  docStatusARestaurar: string;
  userStatusARestaurar: string | null;
  escribeEstadoUsuario: boolean;
  resultado: string;
}

async function main() {
  console.log('=== FASE 4 — VERIFICACIÓN (solo lectura) ===');
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}\n`);

  const dir = path.join(process.cwd(), 'reversion-ia-2');
  const logs = fs.readdirSync(dir).filter((f) => /^revert-ia2-03-aplicado.*\.json$/.test(f)).sort();
  if (!logs.length) {
    console.log('No hay logs de aplicación. Nada que verificar.');
    return;
  }
  console.log(`Logs de aplicación encontrados (${logs.length}):`);
  logs.forEach((l) => console.log(`  ${l}`));

  const revertidas: ResultadoAplicado[] = [];
  for (const l of logs) {
    const contenido = JSON.parse(fs.readFileSync(path.join(dir, l), 'utf8'));
    for (const r of contenido.resultados as ResultadoAplicado[]) {
      if (r.resultado === 'OK') revertidas.push(r);
    }
  }
  console.log(`\nFilas que los logs declaran revertidas: ${revertidas.length}`);

  // -------------------------------------------------------------------------------------------
  // 1 y 2. Nada de lo borrado debe existir.
  // -------------------------------------------------------------------------------------------
  const histIds = revertidas.map((r) => r.historialIaId);
  const estadoIds = revertidas.map((r) => r.historialEstadoIaId).filter((x): x is string => !!x);

  const [histVivos, etiqVivas, estadoVivos] = await Promise.all([
    prisma.userDocumentHistory.findMany({ where: { id: { in: histIds } }, select: { id: true } }),
    prisma.userDocumentHistoryEtiquetas.findMany({
      where: { userDocumentHistoryId: { in: histIds } },
      select: { userDocumentHistoryId: true },
    }),
    prisma.userHistoryStatus.findMany({ where: { id: { in: estadoIds } }, select: { id: true } }),
  ]);

  console.log('\n--- 1. Historiales de la IA borrados ---');
  console.log(`  sobrevivientes: ${histVivos.length} de ${histIds.length} (esperado 0)` +
    (histVivos.length ? ` → ${histVivos.map((h) => h.id).join(', ')}` : ' ✅'));
  console.log('--- 2. Etiquetas borradas ---');
  console.log(`  sobrevivientes: ${etiqVivas.length} (esperado 0)` + (etiqVivas.length ? '' : ' ✅'));
  console.log('--- 3. Filas de UserHistoryStatus de la corrida borradas ---');
  console.log(`  sobrevivientes: ${estadoVivos.length} de ${estadoIds.length} (esperado 0)` +
    (estadoVivos.length ? ` → ${estadoVivos.map((h) => h.id).join(', ')}` : ' ✅'));

  // -------------------------------------------------------------------------------------------
  // 4. Documentos en su status previo.
  // -------------------------------------------------------------------------------------------
  const docs = await prisma.userDocuments.findMany({
    where: { id: { in: revertidas.map((r) => r.userDocumentId) } },
    select: { id: true, status: true },
  });
  const docPorId = new Map(docs.map((d) => [d.id, d.status]));
  const docsMal = revertidas.filter((r) => docPorId.get(r.userDocumentId) !== r.docStatusARestaurar);

  console.log('\n--- 4. Documentos restaurados ---');
  console.log(`  correctos: ${revertidas.length - docsMal.length} de ${revertidas.length}` +
    (docsMal.length ? '' : ' ✅'));
  if (docsMal.length) {
    console.log(`  con status distinto al esperado: ${docsMal.length}`);
    docsMal.forEach((r) =>
      console.log(`    DNI ${r.dni}: esperado ${r.docStatusARestaurar}, está ${docPorId.get(r.userDocumentId)}`),
    );
  }

  // -------------------------------------------------------------------------------------------
  // 5. Participantes en su estado previo. Un desvío acá no es necesariamente un fallo: el sistema
  //    sigue en uso y alguien pudo mover al participante DESPUÉS de la reversión (pasó con 2 casos
  //    en la del 5/8). Se distingue mirando si hay filas de estado posteriores a la reversión.
  // -------------------------------------------------------------------------------------------
  const conEstado = revertidas.filter((r) => r.escribeEstadoUsuario && r.userStatusARestaurar);
  const users = await prisma.user.findMany({
    where: { id: { in: conEstado.map((r) => r.userId) } },
    select: { id: true, status: true },
  });
  const userPorId = new Map(users.map((u) => [u.id, u.status]));
  const usersMal = conEstado.filter((r) => userPorId.get(r.userId) !== r.userStatusARestaurar);

  console.log('\n--- 5. Participantes restaurados ---');
  console.log(`  correctos: ${conEstado.length - usersMal.length} de ${conEstado.length}` +
    (usersMal.length ? '' : ' ✅'));

  if (usersMal.length) {
    // ¿Se movieron después de la reversión?
    const cambiosPosteriores = await prisma.userHistoryStatus.findMany({
      where: {
        userId: { in: usersMal.map((r) => r.userId) },
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, status: true, createdAt: true, createdById: true },
    });
    const porUsuario = new Map<string, typeof cambiosPosteriores>();
    for (const c of cambiosPosteriores) {
      const l = porUsuario.get(c.userId) ?? [];
      l.push(c);
      porUsuario.set(c.userId, l);
    }
    console.log(`  con estado distinto al esperado: ${usersMal.length}`);
    for (const r of usersMal) {
      const movs = porUsuario.get(r.userId) ?? [];
      console.log(
        `    DNI ${r.dni}: esperado ${r.userStatusARestaurar}, está ${userPorId.get(r.userId)}` +
          (movs.length
            ? `\n       movimientos recientes: ${movs.map((m) => `${m.status}@${m.createdAt.toISOString()} por ${m.createdById ?? 'null'}`).join(' | ')}`
            : '\n       ⚠️ sin movimientos recientes registrados — revisar'),
      );
    }
  }

  // -------------------------------------------------------------------------------------------
  // 6. Qué sobrevive con la firma de la corrida.
  // -------------------------------------------------------------------------------------------
  const sobrevivientes = await prisma.userDocumentHistoryEtiquetas.findMany({
    where: {
      etiquetaId: ETIQUETA_IA,
      userDocumentHistory: {
        createdById: AUTOR_CORRIDA,
        createdAt: { gte: VENTANA_INICIO, lte: VENTANA_FIN },
      },
    },
    include: { userDocumentHistory: { include: { userDocuments: true } } },
  });

  const userIdsSobrev = sobrevivientes.map((s) => s.userDocumentHistory.userDocuments.userId);
  const personas = await prisma.person.findMany({
    where: { id: { in: userIdsSobrev } },
    select: { id: true, dni: true },
  });
  const dniPorId = new Map(personas.map((p) => [p.id, p.dni]));

  console.log('\n--- 6. Observaciones de la corrida que siguen en la base ---');
  console.log(`  ${sobrevivientes.length} (esperado: los 21 excluidos + los omitidos)`);
  const dnisSobrev = sobrevivientes
    .map((s) => dniPorId.get(s.userDocumentHistory.userDocuments.userId) ?? '(s/d)')
    .sort();
  console.log(`  DNIs: ${dnisSobrev.join(', ')}`);

  console.log('\n--- Cuadre global ---');
  console.log(`  Escribió la corrida:  ${OBSERVACIONES_TOTALES_CORRIDA}`);
  console.log(`  Revertidas:           ${revertidas.length}`);
  console.log(`  Siguen en la base:    ${sobrevivientes.length}`);
  console.log(`  Suma:                 ${revertidas.length + sobrevivientes.length} ` +
    (revertidas.length + sobrevivientes.length === OBSERVACIONES_TOTALES_CORRIDA ? '✅' : '❌ NO CUADRA'));

  const todoOk =
    histVivos.length === 0 &&
    etiqVivas.length === 0 &&
    estadoVivos.length === 0 &&
    docsMal.length === 0 &&
    revertidas.length + sobrevivientes.length === OBSERVACIONES_TOTALES_CORRIDA;

  console.log(
    `\n${todoOk ? '✅ VERIFICACIÓN OK' : '⚠️ VERIFICACIÓN CON OBSERVACIONES'}` +
      (usersMal.length ? ` — ${usersMal.length} participante(s) con estado distinto, revisar arriba` : ''),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
