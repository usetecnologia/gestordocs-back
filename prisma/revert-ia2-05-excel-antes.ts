import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Excel con la foto de los 371 participantes afectados **tal como estaban ANTES de la reversión**.
 *
 * SOLO LECTURA. Los estados no se leen de la base (ya se revirtieron): salen de los logs de
 * aplicación de `revert-ia2-03-aplicar.ts`, cuyos `planes` se calcularon en vivo inmediatamente antes
 * de escribir cada fila. Son, por tanto, el estado real previo a la reversión.
 *
 * De la base solo se leen los nombres de los participantes.
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia2-05-excel-antes.ts
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

interface Plan {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  historialIaId: string;
  historialIaSnapshot: { status?: string; observation?: string; url?: string; createdAt?: string };
  historialEstadoIaSnapshot: { status?: string } | null;
  docStatusActual: string;
  docStatusARestaurar: string;
  userStatusActual: string;
  userStatusARestaurar: string | null;
  escribeEstadoUsuario: boolean;
  accion: 'REVERTIR' | 'EXCLUIDO' | 'OMITIDO';
  detalle: string;
}

async function main() {
  const dir = path.join(process.cwd(), 'reversion-ia-2');

  // 1. Unir los `planes` de todos los logs (el del canario cubre los 371; el de la corrida completa,
  //    366). Se indexa por historialIaId y gana el más reciente, que es el más cercano a la reversión.
  const logs = fs.readdirSync(dir).filter((f) => /^revert-ia2-03-aplicado.*\.json$/.test(f)).sort();
  const dryRun = path.join(dir, 'revert-ia2-03.dry-run.json');

  const planPorHistorial = new Map<string, Plan>();
  const revertidos = new Set<string>();

  // El dry-run inicial se usa como base porque cubre los 371 antes de cualquier escritura.
  if (fs.existsSync(dryRun)) {
    for (const p of JSON.parse(fs.readFileSync(dryRun, 'utf8')).planes as Plan[]) {
      planPorHistorial.set(p.historialIaId, p);
    }
  }
  for (const l of logs) {
    const contenido = JSON.parse(fs.readFileSync(path.join(dir, l), 'utf8'));
    for (const p of contenido.planes as Plan[]) planPorHistorial.set(p.historialIaId, p);
    for (const r of contenido.resultados as (Plan & { resultado: string })[]) {
      if (r.resultado === 'OK') {
        revertidos.add(r.historialIaId);
        planPorHistorial.set(r.historialIaId, r); // la fila del resultado es la foto exacta al escribir
      }
    }
  }

  const planes = [...planPorHistorial.values()];
  console.log(`Logs leídos: ${logs.length + (fs.existsSync(dryRun) ? 1 : 0)}`);
  console.log(`Participantes en el Excel: ${planes.length}`);
  console.log(`  revertidos: ${revertidos.size}`);
  console.log(`  no revertidos: ${planes.length - revertidos.size}`);

  // 2. Nombres y documento (solo lectura).
  const userIds = [...new Set(planes.map((p) => p.userId))];
  const [personas, docs] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: userIds } },
      select: { id: true, dni: true, firstname: true, middlename: true, lastfathername: true, lastmothername: true },
    }),
    prisma.userDocuments.findMany({
      where: { id: { in: planes.map((p) => p.userDocumentId) } },
      select: {
        id: true,
        documents: { select: { name: true } },
        documentSponsors: { select: { document: { select: { name: true } } } },
      },
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

  // 3. Excel
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Antes de la reversión');

  const encabezados = [
    'DNI',
    'NOMBRE',
    'DOCUMENTO',
    'ESTADO ANTERIOR (antes de la corrida)',
    'ESTADO QUE DEJÓ LA CORRIDA',
    'ESTADO ACTUAL (antes de revertir)',
    'DOC: STATUS ANTERIOR',
    'DOC: STATUS ANTES DE REVERTIR',
    'MOTIVO DE LA OBSERVACIÓN',
    'FECHA DE LA OBSERVACIÓN',
    '¿SE REVIRTIÓ?',
    'DETALLE / MOTIVO DE EXCLUSIÓN',
    'URL DEL DOCUMENTO',
    'USER DOCUMENT ID',
  ];
  const cab = hoja.addRow(encabezados);
  cab.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  const ordenados = planes.sort((a, b) => (a.dni ?? '').localeCompare(b.dni ?? ''));

  for (const p of ordenados) {
    const seRevirtio = revertidos.has(p.historialIaId);
    const fila = hoja.addRow([
      p.dni ?? '',
      nombrePorId.get(p.userId) ?? '',
      docNombrePorId.get(p.userDocumentId) ?? '',
      p.userStatusARestaurar ?? '',
      p.historialEstadoIaSnapshot?.status ?? '',
      p.userStatusActual,
      p.docStatusARestaurar,
      p.docStatusActual,
      p.historialIaSnapshot?.observation ?? '',
      p.historialIaSnapshot?.createdAt ?? '',
      seRevirtio ? 'SI' : 'NO',
      seRevirtio ? '' : p.detalle,
      p.historialIaSnapshot?.url ?? '',
      p.userDocumentId,
    ]);
    // Las filas NO revertidas se marcan: son las que siguen observadas y requieren atención.
    if (!seRevirtio) {
      fila.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      });
    }
  }

  hoja.columns.forEach((col, i) => {
    col.width = [12, 34, 22, 34, 28, 30, 22, 28, 70, 26, 14, 60, 60, 38][i] ?? 18;
  });

  // Hoja de resumen, para no tener que contar a mano.
  const resumen = wb.addWorksheet('Resumen');
  resumen.addRow(['Concepto', 'Cantidad']).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });
  const cuenta = (key: (p: Plan) => string, filtro?: (p: Plan) => boolean) => {
    const m = new Map<string, number>();
    for (const p of ordenados) {
      if (filtro && !filtro(p)) continue;
      m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  resumen.addRow(['Total afectados por la corrida', ordenados.length]);
  resumen.addRow(['Revertidos', revertidos.size]);
  resumen.addRow(['NO revertidos (siguen observados)', ordenados.length - revertidos.size]);
  resumen.addRow([]);
  resumen.addRow(['— Estado anterior (antes de la corrida) —', '']);
  cuenta((p) => p.userStatusARestaurar ?? '(ninguno)').forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Estado que dejó la corrida —', '']);
  cuenta((p) => p.historialEstadoIaSnapshot?.status ?? '(ninguno)').forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Estado actual antes de revertir —', '']);
  cuenta((p) => p.userStatusActual).forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Status del documento antes de la corrida —', '']);
  cuenta((p) => p.docStatusARestaurar || '(ninguno)').forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Motivo de la observación —', '']);
  cuenta((p) => {
    const m = p.historialIaSnapshot?.observation ?? '';
    if (m.includes('no corresponde a un pasaporte')) return 'No corresponde a un pasaporte';
    if (m.includes('menor de edad')) return 'Menor de edad al emitirse el pasaporte';
    if (m.includes('cumplía exactamente')) return 'Cumplía 18 años el mismo día de la emisión';
    if (m.includes('tipo de contenido declarado')) return 'Mismatch de content-type';
    return 'Otro';
  }).forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.addRow([]);
  resumen.addRow(['— Motivo de NO reversión —', '']);
  cuenta((p) => p.detalle, (p) => !revertidos.has(p.historialIaId)).forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.columns.forEach((col, i) => (col.width = i === 0 ? 60 : 14));

  const salida = path.join(dir, 'afectados-antes-de-revertir.xlsx');
  await wb.xlsx.writeFile(salida);
  console.log(`\nExcel generado: ${salida}`);
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
