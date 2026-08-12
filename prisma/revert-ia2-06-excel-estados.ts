import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Excel reducido: por cada participante afectado por la corrida del 7/8/2026, su cadena de estados
 * tal como estaba ANTES de la reversión — estado anterior → estado de observación → lo que vino
 * después (si vino algo).
 *
 * SOLO LECTURA.
 *
 * De dónde sale cada cosa:
 *   - estado anterior y estado de observación: de los logs de `revert-ia2-03-aplicar.ts`, calculados
 *     en vivo justo antes de escribir. La fila de observación ya no está en la base (se borró), así
 *     que el log es la única fuente.
 *   - estados posteriores: de la base, en vivo. La reversión actualizó `User.status` directamente sin
 *     pasar por el puerto de estados, así que NO creó filas de historial: todo lo posterior a la
 *     observación sigue intacto y es legible.
 *
 * El corte en CORTE_PRE_REVERSION deja fuera lo que haya pasado después de que empezara a escribir,
 * para que el Excel sea estrictamente la foto previa.
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia2-06-excel-estados.ts
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

// Momento del respaldo previo a la reversión (backups/2026-08-11T17-47-23-985Z-*): nada de lo que
// aparezca después de aquí formaba parte de la foto previa.
const CORTE_PRE_REVERSION = new Date('2026-08-11T17:47:23Z');

const AUTOR_CORRIDA = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';
const ESTADOS_OBSERVADO = ['OBSERVADO', 'OBSERVADO_SPONSOR'];

// Ventana en la que la corrida escribió el cambio de estado que acompaña a cada observación (llama a
// terminarRevision inmediatamente después de observar). Se usa para EXCLUIR esa fila de los
// "posteriores": en los 21 excluidos y el omitido no se borró, así que sin este filtro aparecería
// como un estado posterior cuando en realidad es el estado de observación mismo.
const MARGEN_ANTES_MS = 5_000;
const MARGEN_DESPUES_MS = 180_000;

interface Plan {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  historialIaId: string;
  historialIaSnapshot: { observation?: string; createdAt?: string };
  historialEstadoIaSnapshot: { status?: string } | null;
  userStatusARestaurar: string | null;
  accion: string;
  detalle: string;
  resultado?: string;
}

async function main() {
  const dir = path.join(process.cwd(), 'reversion-ia-2');

  // 1. Unir los planes de todos los logs para cubrir los 371.
  const planPorHistorial = new Map<string, Plan>();
  const revertidos = new Set<string>();
  const dryRun = path.join(dir, 'revert-ia2-03.dry-run.json');
  if (fs.existsSync(dryRun)) {
    for (const p of JSON.parse(fs.readFileSync(dryRun, 'utf8')).planes as Plan[]) {
      planPorHistorial.set(p.historialIaId, p);
    }
  }
  for (const l of fs.readdirSync(dir).filter((f) => /^revert-ia2-03-aplicado.*\.json$/.test(f)).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, l), 'utf8'));
    for (const p of c.planes as Plan[]) planPorHistorial.set(p.historialIaId, p);
    for (const r of c.resultados as Plan[]) {
      if (r.resultado === 'OK') {
        revertidos.add(r.historialIaId);
        planPorHistorial.set(r.historialIaId, r);
      }
    }
  }
  const planes = [...planPorHistorial.values()];
  console.log(`Participantes: ${planes.length} (revertidos ${revertidos.size}, no revertidos ${planes.length - revertidos.size})`);

  // 2. Datos de la base: nombres, documento y TODO el historial de estados de cada afectado.
  const userIds = [...new Set(planes.map((p) => p.userId))];
  const [personas, docs, estados] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
    }),
    prisma.userDocuments.findMany({
      where: { id: { in: planes.map((p) => p.userDocumentId) } },
      select: {
        id: true,
        documents: { select: { name: true } },
        documentSponsors: { select: { document: { select: { name: true } } } },
      },
    }),
    prisma.userHistoryStatus.findMany({
      where: { userId: { in: userIds }, createdAt: { lte: CORTE_PRE_REVERSION } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true, status: true, createdAt: true, createdById: true },
    }),
  ]);

  const nombrePorId = new Map(
    personas.map((p) => [
      p.id,
      [p.firstname, p.middlename, p.lastfathername, p.lastmothername].filter(Boolean).join(' ').trim(),
    ]),
  );
  const docNombrePorId = new Map(
    docs.map((d) => [d.id, d.documentSponsors?.document?.name ?? d.documents?.name ?? '(desconocido)']),
  );
  const estadosPorUsuario = new Map<string, typeof estados>();
  for (const e of estados) {
    const l = estadosPorUsuario.get(e.userId) ?? [];
    l.push(e);
    estadosPorUsuario.set(e.userId, l);
  }

  // 3. Excel
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Estados antes de revertir');
  const cab = hoja.addRow([
    'DNI',
    'NOMBRE',
    'DOCUMENTO',
    'FECHA DE LA OBSERVACIÓN',
    '¿SE REVIRTIÓ?',
    'ESTADO ANTERIOR',
    'ESTADO DE OBSERVACIÓN',
    '¿TIENE ESTADO POSTERIOR?',
    'ÚLTIMO ESTADO POSTERIOR',
    'CANT. POSTERIORES',
    'POSTERIORES SOLO DEL CRON',
    'ESTADOS POSTERIORES (detalle)',
  ]);
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  const esHoraDelCron = (d: Date) => d.getUTCHours() === 7 && d.getUTCMinutes() < 20;

  /** Estados posteriores a la observación y previos a la reversión, sin contar la fila que escribió
   *  la propia corrida (que sobrevive en los 22 no revertidos). */
  const posterioresDe = (p: Plan) => {
    const iaEn = p.historialIaSnapshot?.createdAt ? new Date(p.historialIaSnapshot.createdAt) : null;
    if (!iaEn) return [];
    return (estadosPorUsuario.get(p.userId) ?? []).filter((e) => {
      if (e.createdAt.getTime() <= iaEn.getTime()) return false;
      const esFilaDeLaCorrida =
        e.createdById === AUTOR_CORRIDA &&
        ESTADOS_OBSERVADO.includes(e.status) &&
        e.createdAt.getTime() >= iaEn.getTime() - MARGEN_ANTES_MS &&
        e.createdAt.getTime() <= iaEn.getTime() + MARGEN_DESPUES_MS;
      return !esFilaDeLaCorrida;
    });
  };

  const ordenados = planes.sort((a, b) => (a.dni ?? '').localeCompare(b.dni ?? ''));

  for (const p of ordenados) {
    const posteriores = posterioresDe(p);
    const soloCron = posteriores.length > 0 && posteriores.every((e) => esHoraDelCron(e.createdAt));

    const fila = hoja.addRow([
      p.dni ?? '',
      nombrePorId.get(p.userId) ?? '',
      docNombrePorId.get(p.userDocumentId) ?? '',
      p.historialIaSnapshot?.createdAt ?? '',
      revertidos.has(p.historialIaId) ? 'SI' : 'NO',
      p.userStatusARestaurar ?? '',
      p.historialEstadoIaSnapshot?.status ?? '',
      posteriores.length ? 'SI' : 'NO',
      posteriores.length ? posteriores[posteriores.length - 1].status : '',
      posteriores.length,
      posteriores.length ? (soloCron ? 'SI' : 'NO') : '',
      posteriores
        .map((e) => `${e.status}@${e.createdAt.toISOString()}${e.createdById === AUTOR_CORRIDA ? ' (usedocs/cron)' : ` por ${e.createdById ?? 'sistema'}`}`)
        .join(' | '),
    ]);

    // Resaltado: amarillo los no revertidos; naranja los que tienen posteriores que NO son del cron
    // (ahí hubo alguien trabajando, es lo que conviene mirar).
    if (!revertidos.has(p.historialIaId)) {
      fila.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }));
    } else if (posteriores.length && !soloCron) {
      fila.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }));
    }
  }

  hoja.columns.forEach((col, i) => {
    col.width = [12, 34, 22, 26, 14, 26, 24, 24, 26, 18, 24, 100][i] ?? 18;
  });

  // Resumen
  const resumen = wb.addWorksheet('Resumen');
  resumen.addRow(['Concepto', 'Cantidad']).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });
  const conPosteriores = ordenados.filter((p) => posterioresDe(p).length > 0);
  const soloCronCount = conPosteriores.filter((p) =>
    posterioresDe(p).every((e) => esHoraDelCron(e.createdAt)),
  ).length;

  resumen.addRow(['Total afectados', ordenados.length]);
  resumen.addRow(['Revertidos', revertidos.size]);
  resumen.addRow(['NO revertidos (siguen observados)', ordenados.length - revertidos.size]);
  resumen.addRow([]);
  resumen.addRow(['Con al menos un estado posterior a la observación', conPosteriores.length]);
  resumen.addRow(['  de esos, posteriores SOLO del cron (07:0x UTC)', soloCronCount]);
  resumen.addRow(['  de esos, con intervención fuera del cron', conPosteriores.length - soloCronCount]);
  resumen.addRow(['Sin ningún estado posterior', ordenados.length - conPosteriores.length]);
  resumen.addRow([]);

  const cuenta = (key: (p: Plan) => string) => {
    const m = new Map<string, number>();
    for (const p of ordenados) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  resumen.addRow(['— Estado anterior —', '']);
  cuenta((p) => p.userStatusARestaurar ?? '(ninguno)').forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Estado de observación —', '']);
  cuenta((p) => p.historialEstadoIaSnapshot?.status ?? '(ninguno)').forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.columns.forEach((col, i) => (col.width = i === 0 ? 56 : 14));

  const salida = path.join(dir, 'afectados-estados.xlsx');
  await wb.xlsx.writeFile(salida);
  console.log(`\nExcel generado: ${salida}`);
  console.log(`Con estado posterior: ${conPosteriores.length} (solo cron: ${soloCronCount}, con personas: ${conPosteriores.length - soloCronCount})`);
  console.log('No se escribió NADA en la base de datos.');
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
