import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 3 — Reversión de la revisión masiva de pasaportes del viernes 7/8/2026.
 *
 * ⚠️ ESTE ES EL ÚNICO SCRIPT DE LA SERIE QUE ESCRIBE EN LA BASE, y solo con `--apply`.
 * Sin `--apply` es un dry-run: imprime y registra en disco exactamente lo que haría, sin tocar nada.
 *
 * ⚠️ La base del `.env` es PRODUCCIÓN (161.132.45.31:3394/docs26). No ejecutar con `--apply` sin el
 * `mysqldump` de las 5 tablas involucradas hecho y verificado.
 *
 * Contexto y decisiones: docs/PENDIENTE-reversion-pasaportes-07-08.md
 *
 * Uso:
 *   npx ts-node -r tsconfig-paths/register prisma/revert-ia2-03-aplicar.ts                # dry-run
 *   npx ts-node -r tsconfig-paths/register prisma/revert-ia2-03-aplicar.ts --limit 5      # dry-run de 5
 *   npx ts-node -r tsconfig-paths/register prisma/revert-ia2-03-aplicar.ts --apply --limit 5   # canario real
 *   npx ts-node -r tsconfig-paths/register prisma/revert-ia2-03-aplicar.ts --apply        # reversión completa
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

const ESTADOS_OBSERVADO = ['OBSERVADO', 'OBSERVADO_SPONSOR'];
const MARGEN_ANTES_MS = 5_000;
const MARGEN_DESPUES_MS = 180_000;

// Cuántas observaciones escribió la corrida en total. El script aborta si lo que encuentra en vivo
// no cuadra con esto MENOS lo ya revertido en corridas anteriores (ver REGISTRO_ACUMULADO): así una
// ejecución parcial —el canario de 5, por ejemplo— no dispara una falsa alarma, pero cualquier otra
// discrepancia (una corrida nueva, un borrado ajeno) sí la dispara.
const OBSERVACIONES_TOTALES_CORRIDA = 371;

// Registro acumulado de los historiales ya revertidos, entre ejecuciones. Es la memoria del script:
// sin él no se puede distinguir "ya lo revertimos nosotros" de "lo borró alguien más".
const REGISTRO_ACUMULADO = 'revert-ia2-03-revertidas.json';

/**
 * Exclusiones decididas el 11/8/2026 (ver §5-bis del documento). Estos participantes NO se tocan:
 * ni el documento, ni el estado, ni el historial de la IA.
 */
const EXCLUIDOS: Record<string, string> = {
  // Los 12 cuyo documento ya trabajó el equipo después de la corrida
  '72613065': 'documento ya trabajado por el equipo',
  '70636377': 'documento ya trabajado por el equipo',
  '70592556': 'documento ya trabajado por el equipo',
  '61345369': 'documento ya trabajado por el equipo',
  '60798081': 'documento ya trabajado por el equipo',
  '60880295': 'documento ya trabajado por el equipo',
  '60556582': 'documento ya trabajado por el equipo',
  '60772118': 'documento ya trabajado por el equipo',
  '60822745': 'documento ya trabajado por el equipo',
  '71161455': 'documento ya trabajado por el equipo',
  '61482158': 'documento ya trabajado por el equipo',
  '60777503': 'documento ya trabajado por el equipo',
  // Registros de prueba
  '12345666': 'registro de prueba',
  '12345678': 'registro de prueba',
  // Ya estaban OBSERVADO antes de la corrida y además están INACTIVO (mismos 5 excluidos el 5/8)
  '73254293': 'INACTIVO y ya observado antes de la corrida',
  '71155531': 'INACTIVO y ya observado antes de la corrida',
  '73984442': 'INACTIVO y ya observado antes de la corrida',
  '71183524': 'INACTIVO y ya observado antes de la corrida',
  '70487231': 'INACTIVO y ya observado antes de la corrida',
  // Los 2 conflictivos de la validación de estados
  '70710164': 'el equipo ya lo resolvió y el participante subió un pasaporte nuevo',
  '70644102': 'lo movieron a PENDIENTE_REVISAR después de la corrida',
};

const APLICAR = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMITE = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

interface Plan {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  // qué se borra
  historialIaId: string;
  historialIaSnapshot: Record<string, unknown>;
  etiquetasABorrar: string[];
  historialEstadoIaId: string | null;
  historialEstadoIaSnapshot: Record<string, unknown> | null;
  // qué se actualiza
  docStatusActual: string;
  docStatusARestaurar: string;
  userStatusActual: string;
  userStatusARestaurar: string | null;
  escribeEstadoUsuario: boolean;
  // resultado
  accion: 'REVERTIR' | 'EXCLUIDO' | 'OMITIDO';
  detalle: string;
}

function abortar(mensaje: string): never {
  console.error(`\n🛑 ABORTADO: ${mensaje}`);
  console.error('No se escribió nada en la base.');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(100));
  console.log(`=== FASE 3 — REVERSIÓN corrida 7/8/2026 — MODO: ${APLICAR ? '🔴 APPLY (ESCRIBE)' : '🟢 DRY-RUN'} ===`);
  console.log('='.repeat(100));
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
  if (LIMITE !== Infinity) console.log(`Límite: solo las primeras ${LIMITE} observaciones`);
  console.log('');

  // ---------------------------------------------------------------------------------------------
  // 1. Inventario EN VIVO. Nunca se lee inventario.json: entre el análisis y la ejecución el equipo
  //    sigue trabajando (durante el análisis del 11/8 cambiaron 3 casos en una hora).
  // ---------------------------------------------------------------------------------------------
  const etiquetados = await prisma.userDocumentHistoryEtiquetas.findMany({
    where: {
      etiquetaId: ETIQUETA_IA,
      userDocumentHistory: {
        createdById: AUTOR_CORRIDA,
        createdAt: { gte: VENTANA_INICIO, lte: VENTANA_FIN },
      },
    },
    include: { userDocumentHistory: { include: { userDocuments: true } } },
  });

  const historialesIa = etiquetados
    .map((e) => e.userDocumentHistory)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Lo ya revertido por ejecuciones anteriores de este mismo script.
  const registroPath = path.join(process.cwd(), 'reversion-ia-2', REGISTRO_ACUMULADO);
  const yaRevertidas: string[] = fs.existsSync(registroPath)
    ? (JSON.parse(fs.readFileSync(registroPath, 'utf8')) as string[])
    : [];
  const esperadas = OBSERVACIONES_TOTALES_CORRIDA - yaRevertidas.length;

  console.log(`Observaciones de la corrida encontradas: ${historialesIa.length}`);
  console.log(`  Total que escribió la corrida:     ${OBSERVACIONES_TOTALES_CORRIDA}`);
  console.log(`  Ya revertidas en corridas previas: ${yaRevertidas.length}`);
  console.log(`  Esperadas ahora:                   ${esperadas}`);

  if (historialesIa.length !== esperadas) {
    abortar(
      `se esperaban ${esperadas} observaciones (${OBSERVACIONES_TOTALES_CORRIDA} de la corrida ` +
        `− ${yaRevertidas.length} ya revertidas) y hay ${historialesIa.length}. ` +
        'Alguien más borró o escribió filas de esta corrida — revisar con revert-ia2-01-inventario.ts ' +
        'antes de continuar.',
    );
  }

  // Coherencia inversa: ninguna de las ya revertidas debería seguir viva.
  const resucitadas = historialesIa.filter((h) => yaRevertidas.includes(h.id));
  if (resucitadas.length) {
    abortar(
      `${resucitadas.length} historial(es) que el registro da por revertidos siguen en la base ` +
        `(${resucitadas.map((h) => h.id).join(', ')}). El registro no es fiable — revisar a mano.`,
    );
  }

  const userDocumentIds = [...new Set(historialesIa.map((h) => h.userDocumentsId))];
  const userIds = [...new Set(historialesIa.map((h) => h.userDocuments.userId))];

  const [todoElHistorial, usuarios, personas, historialEstados] = await Promise.all([
    prisma.userDocumentHistory.findMany({
      where: { userDocumentsId: { in: userDocumentIds } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, userDocumentsId: true, status: true, url: true, observation: true,
        createdAt: true, createdById: true,
      },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, status: true } }),
    prisma.person.findMany({ where: { id: { in: userIds } }, select: { id: true, dni: true } }),
    prisma.userHistoryStatus.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, status: true, createdAt: true, createdById: true },
    }),
  ]);

  const historialPorDocumento = new Map<string, typeof todoElHistorial>();
  for (const h of todoElHistorial) {
    const lista = historialPorDocumento.get(h.userDocumentsId) ?? [];
    lista.push(h);
    historialPorDocumento.set(h.userDocumentsId, lista);
  }
  const estadosPorUsuario = new Map<string, typeof historialEstados>();
  for (const e of historialEstados) {
    const lista = estadosPorUsuario.get(e.userId) ?? [];
    lista.push(e);
    estadosPorUsuario.set(e.userId, lista);
  }
  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
  const dniPorId = new Map(personas.map((p) => [p.id, p.dni]));

  // ---------------------------------------------------------------------------------------------
  // 2. Armado del plan, con todas las verificaciones de seguridad.
  // ---------------------------------------------------------------------------------------------
  const planes: Plan[] = [];

  for (const ia of historialesIa) {
    const doc = ia.userDocuments;
    const dni = dniPorId.get(doc.userId) ?? null;
    const historial = historialPorDocumento.get(ia.userDocumentsId) ?? [];
    const indiceIa = historial.findIndex((h) => h.id === ia.id);
    const anterior = indiceIa > 0 ? historial[indiceIa - 1] : null;
    const posteriores = historial.slice(indiceIa + 1);

    const estados = estadosPorUsuario.get(doc.userId) ?? [];
    const indiceEstadoIa = estados.findIndex(
      (e) =>
        ESTADOS_OBSERVADO.includes(e.status) &&
        e.createdById === AUTOR_CORRIDA &&
        e.createdAt.getTime() >= ia.createdAt.getTime() - MARGEN_ANTES_MS &&
        e.createdAt.getTime() <= ia.createdAt.getTime() + MARGEN_DESPUES_MS,
    );
    const estadoIa = indiceEstadoIa >= 0 ? estados[indiceEstadoIa] : null;
    const estadoAnterior = indiceEstadoIa > 0 ? estados[indiceEstadoIa - 1] : null;
    const userStatusActual = usuarioPorId.get(doc.userId)?.status ?? '(desconocido)';

    const base = {
      dni,
      userId: doc.userId,
      userDocumentId: doc.id,
      historialIaId: ia.id,
      historialIaSnapshot: {
        id: ia.id, userDocumentsId: ia.userDocumentsId, status: ia.status,
        observation: ia.observation, url: ia.url,
        createdAt: iso(ia.createdAt), createdById: ia.createdById,
      },
      etiquetasABorrar: etiquetados
        .filter((e) => e.userDocumentHistoryId === ia.id)
        .map((e) => e.etiquetaId),
      historialEstadoIaId: estadoIa?.id ?? null,
      historialEstadoIaSnapshot: estadoIa
        ? { id: estadoIa.id, userId: estadoIa.userId, status: estadoIa.status,
            createdAt: iso(estadoIa.createdAt), createdById: estadoIa.createdById }
        : null,
      docStatusActual: doc.status,
      docStatusARestaurar: anterior?.status ?? '',
      userStatusActual,
      userStatusARestaurar: estadoAnterior?.status ?? null,
      escribeEstadoUsuario: false,
    };

    // --- Exclusión por decisión
    if (dni && EXCLUIDOS[dni]) {
      planes.push({ ...base, accion: 'EXCLUIDO', detalle: EXCLUIDOS[dni] });
      continue;
    }

    // --- Verificaciones de seguridad (cualquiera que falle → se omite esa fila, no se aborta todo)
    const problemas: string[] = [];
    if (posteriores.length) {
      problemas.push(
        `el documento tiene ${posteriores.length} historial(es) posterior(es): ` +
          posteriores.map((p) => `${p.status}@${iso(p.createdAt)}`).join(', '),
      );
    }
    if (!anterior) problemas.push('no hay historial anterior del que tomar el status previo');
    if (doc.status !== 'OBSERVADO') {
      problemas.push(`el documento ya no está en OBSERVADO sino en ${doc.status}`);
    }
    if (!estadoIa) problemas.push('no se localizó la fila de UserHistoryStatus que escribió la corrida');
    if (estadoIa && !estadoAnterior) problemas.push('no hay estado previo del participante');
    // El participante debe seguir en un estado observado (consecuencia de la corrida) o ya estar en
    // su estado previo (no-op: el cron lo devolvió solo). Cualquier otra cosa es trabajo de alguien.
    if (
      !ESTADOS_OBSERVADO.includes(userStatusActual) &&
      userStatusActual !== estadoAnterior?.status
    ) {
      problemas.push(
        `el participante está en ${userStatusActual}, que no es un estado observado ni su estado ` +
          `previo (${estadoAnterior?.status}) — alguien lo movió`,
      );
    }

    if (problemas.length) {
      planes.push({ ...base, accion: 'OMITIDO', detalle: problemas.join(' | ') });
      continue;
    }

    planes.push({
      ...base,
      escribeEstadoUsuario: estadoAnterior!.status !== userStatusActual,
      accion: 'REVERTIR',
      detalle:
        estadoAnterior!.status !== userStatusActual
          ? `doc ${doc.status}→${anterior!.status}, participante ${userStatusActual}→${estadoAnterior!.status}`
          : `doc ${doc.status}→${anterior!.status}, participante sin cambio (ya está en ${userStatusActual})`,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Resumen del plan
  // ---------------------------------------------------------------------------------------------
  const aRevertir = planes.filter((p) => p.accion === 'REVERTIR');
  const excluidos = planes.filter((p) => p.accion === 'EXCLUIDO');
  const omitidos = planes.filter((p) => p.accion === 'OMITIDO');

  const cuenta = (lista: Plan[], key: (p: Plan) => string) => {
    const m = new Map<string, number>();
    for (const p of lista) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };

  console.log('=== PLAN ===');
  console.log(`  A revertir: ${aRevertir.length}`);
  console.log(`    con escritura del estado del participante: ${aRevertir.filter((p) => p.escribeEstadoUsuario).length}`);
  console.log(`    sin escritura (ya está en su estado previo): ${aRevertir.filter((p) => !p.escribeEstadoUsuario).length}`);
  console.log(`  Excluidos por decisión: ${excluidos.length}`);
  console.log(`  Omitidos por verificación: ${omitidos.length}`);
  console.log(`  ─────`);
  console.log(`  Total: ${planes.length}`);
  console.log('\n  Status de documento a restaurar:', cuenta(aRevertir, (p) => p.docStatusARestaurar));
  console.log('  Estado de participante a restaurar:', cuenta(aRevertir.filter((p) => p.escribeEstadoUsuario), (p) => p.userStatusARestaurar ?? '?'));

  if (omitidos.length) {
    console.log(`\n=== OMITIDOS (${omitidos.length}) — cambiaron desde la validación, NO se tocan ===`);
    omitidos.forEach((p) => console.log(`  DNI ${p.dni}\n     → ${p.detalle}`));
  }

  // Aviso de deriva: si aparecen omitidos nuevos respecto de lo validado el 11/8, conviene mirarlos
  // antes de seguir. No aborta —omitir es seguro— pero se marca fuerte.
  if (omitidos.length > 0 && APLICAR) {
    console.log(
      `\n⚠️  ${omitidos.length} fila(s) se omiten por deriva. Es seguro (no se escriben), pero ` +
        'quedan sin revertir y hay que decidir qué hacer con ellas después.',
    );
  }

  const filasHistorialABorrar = aRevertir.length;
  const filasEtiquetaABorrar = aRevertir.reduce((a, p) => a + p.etiquetasABorrar.length, 0);
  const filasEstadoABorrar = aRevertir.filter((p) => p.historialEstadoIaId).length;

  console.log('\n=== ESCRITURAS QUE SE HARÍAN ===');
  console.log(`  DELETE UserDocumentHistoryEtiquetas: ${filasEtiquetaABorrar}`);
  console.log(`  DELETE UserDocumentHistory:          ${filasHistorialABorrar}`);
  console.log(`  UPDATE UserDocuments.status:         ${aRevertir.length}`);
  console.log(`  DELETE UserHistoryStatus:            ${filasEstadoABorrar}`);
  console.log(`  UPDATE User.status:                  ${aRevertir.filter((p) => p.escribeEstadoUsuario).length}`);
  console.log('  (no se borra ningún documento · no se toca S3 · no se borran las filas del cron)');

  // ---------------------------------------------------------------------------------------------
  // 4. Ejecución
  // ---------------------------------------------------------------------------------------------
  const objetivo = aRevertir.slice(0, LIMITE === Infinity ? undefined : LIMITE);
  const resultados: (Plan & { resultado: string })[] = [];

  if (!APLICAR) {
    console.log(`\n🟢 DRY-RUN — no se escribió nada. Se habrían revertido ${objetivo.length} filas.`);
    console.log('   Para aplicar: agregar --apply (y tener el mysqldump hecho).');
    objetivo.slice(0, 10).forEach((p) =>
      console.log(`   ej. DNI ${p.dni}: ${p.detalle}`),
    );
    if (objetivo.length > 10) console.log(`   ... y ${objetivo.length - 10} más`);
  } else {
    console.log(`\n🔴 APLICANDO sobre ${objetivo.length} filas...\n`);

    let ok = 0;
    let fallidos = 0;

    for (const [i, p] of objetivo.entries()) {
      try {
        // Cada fila en su propia transacción: si una falla, no arrastra a las demás y el log queda
        // exacto. Con ~350 filas el coste de 350 transacciones cortas es irrelevante, y evita
        // mantener locks largos sobre tablas que el sistema está usando en vivo.
        await prisma.$transaction(async (tx) => {
          // Re-verificación DENTRO de la transacción: entre el armado del plan y este momento
          // pudieron pasar minutos. Si algo cambió, esta fila se cae sola sin escribir.
          const docActual = await tx.userDocuments.findUnique({
            where: { id: p.userDocumentId },
            select: { status: true },
          });
          if (docActual?.status !== 'OBSERVADO') {
            throw new Error(`el documento pasó a ${docActual?.status ?? '(borrado)'} justo ahora`);
          }
          const posteriores = await tx.userDocumentHistory.count({
            where: { userDocumentsId: p.userDocumentId, createdAt: { gt: new Date(String(p.historialIaSnapshot.createdAt)) } },
          });
          if (posteriores > 0) {
            throw new Error(`apareció ${posteriores} historial(es) posterior(es) justo ahora`);
          }

          await tx.userDocumentHistoryEtiquetas.deleteMany({
            where: { userDocumentHistoryId: p.historialIaId },
          });
          await tx.userDocumentHistory.delete({ where: { id: p.historialIaId } });
          await tx.userDocuments.update({
            where: { id: p.userDocumentId },
            data: { status: p.docStatusARestaurar as never },
          });
          if (p.historialEstadoIaId) {
            await tx.userHistoryStatus.delete({ where: { id: p.historialEstadoIaId } });
          }
          if (p.escribeEstadoUsuario && p.userStatusARestaurar) {
            await tx.user.update({
              where: { id: p.userId },
              data: { status: p.userStatusARestaurar as never },
            });
          }
        });
        ok++;
        resultados.push({ ...p, resultado: 'OK' });
      } catch (err) {
        fallidos++;
        const msg = err instanceof Error ? err.message : 'error desconocido';
        console.error(`  ✗ DNI ${p.dni}: ${msg}`);
        resultados.push({ ...p, resultado: `ERROR: ${msg}` });
      }

      if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${objetivo.length}`);
    }

    console.log(`\n=== RESULTADO ===`);
    console.log(`  Revertidas correctamente: ${ok}`);
    console.log(`  Con error:                ${fallidos}`);
  }

  // ---------------------------------------------------------------------------------------------
  // 5. Log en disco — con el contenido completo de cada fila borrada, para poder reconstruirla sin
  //    recurrir al backup.
  // ---------------------------------------------------------------------------------------------
  const salidaDir = path.join(process.cwd(), 'reversion-ia-2');
  fs.mkdirSync(salidaDir, { recursive: true });

  // Los logs de APPLY llevan timestamp: cada ejecución es evidencia de auditoría y no debe
  // sobreescribir la anterior (el canario de 5 se perdería al correr las 348 restantes).
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const nombre = APLICAR ? `revert-ia2-03-aplicado-${sello}.json` : 'revert-ia2-03.dry-run.json';
  const logPath = path.join(salidaDir, nombre);

  if (APLICAR) {
    const nuevas = resultados.filter((r) => r.resultado === 'OK').map((r) => r.historialIaId);
    fs.writeFileSync(registroPath, JSON.stringify([...yaRevertidas, ...nuevas], null, 2), 'utf8');
    console.log(`\nRegistro acumulado actualizado: ${yaRevertidas.length + nuevas.length}/${OBSERVACIONES_TOTALES_CORRIDA} revertidas`);
  }
  fs.writeFileSync(
    logPath,
    JSON.stringify(
      {
        modo: APLICAR ? 'APPLY' : 'DRY_RUN',
        base: `${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`,
        limite: LIMITE === Infinity ? null : LIMITE,
        totales: {
          observaciones: planes.length,
          aRevertir: aRevertir.length,
          excluidos: excluidos.length,
          omitidos: omitidos.length,
          procesadas: APLICAR ? resultados.length : 0,
          ok: resultados.filter((r) => r.resultado === 'OK').length,
          errores: resultados.filter((r) => r.resultado !== 'OK').length,
        },
        planes,
        resultados: APLICAR ? resultados : [],
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nLog: ${logPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // El contexto de Prisma/Nest deja handles abiertos y el proceso se queda colgado al terminar
    // (pasó en la reversión del 5/8 y hubo que matarlo). Ya escribimos el log, así que salir es seguro.
    process.exit(process.exitCode ?? 0);
  });
