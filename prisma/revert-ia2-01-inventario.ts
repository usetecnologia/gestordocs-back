import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 1 — Inventario de la reversión de la revisión masiva de pasaportes del **viernes 7/8/2026
 * por la noche** (segundo incidente del mismo API; el del 4/8 ya se revirtió, ver
 * docs/PENDIENTE-reversion-observaciones-ia.md).
 *
 * SOLO LECTURA: no escribe una sola fila en la base. Su salida son archivos locales (JSON + Excel).
 *
 * La corrida NO se identifica solo por la etiqueta IA: quedan 15 filas del 4/8 (los excluidos de esa
 * reversión) y 2 observaciones manuales hechas con la misma etiqueta por otras personas. La firma
 * real, establecida con inspect-corrida-07-08.ts, es etiqueta + autor + ventana.
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia2-01-inventario.ts [excel-reporte] [carpeta-salida]
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
// Ventana de la corrida (UTC), con un minuto de margen a cada lado sobre los extremos observados
// (01:21:40.089 → 04:42:54.751). En hora de Perú: viernes 7/8 20:21 → 23:42.
const VENTANA_INICIO = new Date('2026-08-08T01:20:00Z');
const VENTANA_FIN = new Date('2026-08-08T04:44:00Z');

const ESTADOS_OBSERVADO = ['OBSERVADO', 'OBSERVADO_SPONSOR'];

// La corrida llama a terminarRevision inmediatamente después de escribir la observación. Se acota la
// búsqueda del cambio de estado a esa vecindad para no confundirlo con el cron diario de las 07:00
// UTC ni con cambios hechos por personas.
const MARGEN_ANTES_MS = 5_000;
const MARGEN_DESPUES_MS = 180_000;

// Estados que el cron `bulk-info-participants-daily` no reevalúa (ver el doc del incidente 4/8): si
// el participante quedó en uno de estos, la reversión no puede delegar el recálculo al sync.
const ESTADOS_BLOQUEADOS_AL_SYNC = [
  'ENVIADO_SPONSOR', 'OBSERVADO_SPONSOR', 'RECHAZADO_SPONSOR',
  'APROBADO_SPONSOR', 'DS2019_EMITIDO', 'RETENIDO_USE', 'INACTIVO',
];

const excelReporte = process.argv[2] ?? null;
const salidaDir = process.argv[3] ?? path.join(process.cwd(), 'reversion-ia-2');

interface FilaInventario {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  documento: string;
  historialIaId: string;
  historialIaCreatedAt: string;
  motivo: string;
  urlHistorialIa: string | null;
  docStatusActual: string;
  docStatusARestaurar: string | null;
  historialesPosteriores: number;
  detallePosteriores: string;
  userStatusActual: string;
  historialEstadoIaId: string | null;
  userStatusIa: string | null;
  userStatusARestaurar: string | null;
  cambiosEstadoPosteriores: number;
  detalleEstadosPosteriores: string;
  bloqueadoAlSync: boolean;
  reversible: boolean;
  motivoExclusion: string | null;
}

const iso = (d: Date) => d.toISOString();

const cuenta = <T>(lista: T[], key: (f: T) => string) => {
  const m = new Map<string, number>();
  for (const f of lista) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};

async function leerExcel(ruta: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const ws = wb.worksheets[0];
  const filas: { dni: string; observado: string; estado: string; motivo: string; url: string }[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const g = (n: number) => {
      const v = row.getCell(n).value;
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return String((v as { text?: string }).text ?? '');
      return String(v).trim();
    };
    filas.push({ dni: g(1), observado: g(2), estado: g(3), motivo: g(4), url: g(5) });
  });
  return filas;
}

async function main() {
  console.log('=== FASE 1 — INVENTARIO corrida 7/8/2026 (solo lectura) ===');
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
  console.log(`Firma: etiqueta ${ETIQUETA_IA} + autor ${AUTOR_CORRIDA}`);
  console.log(`Ventana: ${iso(VENTANA_INICIO)} → ${iso(VENTANA_FIN)}\n`);

  // 1. Historiales escritos por ESTA corrida.
  const etiquetados = await prisma.userDocumentHistoryEtiquetas.findMany({
    where: {
      etiquetaId: ETIQUETA_IA,
      userDocumentHistory: {
        createdById: AUTOR_CORRIDA,
        createdAt: { gte: VENTANA_INICIO, lte: VENTANA_FIN },
      },
    },
    include: {
      userDocumentHistory: {
        include: {
          userDocuments: {
            include: {
              documents: { select: { name: true, siglasCode: true } },
              documentSponsors: { select: { document: { select: { name: true, siglasCode: true } } } },
            },
          },
        },
      },
    },
  });

  if (!etiquetados.length) {
    console.log('No se encontró ningún historial de esta corrida. Nada que revertir.');
    return;
  }

  const historialesIa = etiquetados
    .map((e) => e.userDocumentHistory)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const primero = historialesIa[0].createdAt;
  const ultimo = historialesIa[historialesIa.length - 1].createdAt;

  console.log(`Historiales escritos por la corrida: ${historialesIa.length}`);
  console.log(`Ventana real: ${iso(primero)} → ${iso(ultimo)}`);
  console.log(`Documentos distintos: ${new Set(historialesIa.map((h) => h.userDocumentsId)).size}`);
  console.log(`Participantes distintos: ${new Set(historialesIa.map((h) => h.userDocuments.userId)).size}\n`);

  // 2. ¿Escribió la corrida algo más en la ventana, fuera de estas observaciones?
  const otrosEnVentana = await prisma.userDocumentHistory.findMany({
    where: {
      createdById: AUTOR_CORRIDA,
      createdAt: { gte: VENTANA_INICIO, lte: VENTANA_FIN },
      id: { notIn: historialesIa.map((h) => h.id) },
    },
    select: { id: true, status: true, createdAt: true, userDocumentsId: true },
  });
  console.log(`Otros historiales del mismo autor dentro de la ventana: ${otrosEnVentana.length}`);
  if (otrosEnVentana.length) console.log('  ', cuenta(otrosEnVentana, (h) => h.status));

  // 3. Historial COMPLETO de cada documento afectado (estado previo + escrituras posteriores).
  const userDocumentIds = [...new Set(historialesIa.map((h) => h.userDocumentsId))];
  const todoElHistorial = await prisma.userDocumentHistory.findMany({
    where: { userDocumentsId: { in: userDocumentIds } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, userDocumentsId: true, status: true, url: true,
      createdAt: true, createdById: true, observation: true,
    },
  });
  const historialPorDocumento = new Map<string, typeof todoElHistorial>();
  for (const h of todoElHistorial) {
    const lista = historialPorDocumento.get(h.userDocumentsId) ?? [];
    lista.push(h);
    historialPorDocumento.set(h.userDocumentsId, lista);
  }

  // 4. Estado actual y trazabilidad de estados de cada participante afectado.
  const userIds = [...new Set(historialesIa.map((h) => h.userDocuments.userId))];
  const [usuarios, personas, historialEstados] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, status: true, fechadeenvioalsponsor: true },
    }),
    prisma.person.findMany({ where: { id: { in: userIds } }, select: { id: true, dni: true } }),
    prisma.userHistoryStatus.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, status: true, createdAt: true, createdById: true },
    }),
  ]);

  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
  const dniPorId = new Map(personas.map((p) => [p.id, p.dni]));
  const estadosPorUsuario = new Map<string, typeof historialEstados>();
  for (const e of historialEstados) {
    const lista = estadosPorUsuario.get(e.userId) ?? [];
    lista.push(e);
    estadosPorUsuario.set(e.userId, lista);
  }

  // 5. Armado del inventario.
  const filas: FilaInventario[] = [];

  for (const ia of historialesIa) {
    const doc = ia.userDocuments;
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
    const estadosPosteriores = indiceEstadoIa >= 0 ? estados.slice(indiceEstadoIa + 1) : [];

    const exclusiones: string[] = [];
    if (posteriores.length) {
      exclusiones.push(
        `el documento tiene ${posteriores.length} historial(es) posterior(es) a la observación IA`,
      );
    }
    if (!anterior) {
      exclusiones.push('no hay historial anterior: no se puede reconstruir el status previo del documento');
    }
    if (!estadoIa) {
      exclusiones.push('no se encontró el cambio de estado del participante asociado a esta observación');
    }
    if (estadosPosteriores.length) {
      exclusiones.push(`el participante cambió de estado ${estadosPosteriores.length} vez(ces) después`);
    }
    if (estadoIa && !estadoAnterior) {
      exclusiones.push('no hay estado previo del participante para restaurar');
    }

    const userStatusActual = usuarioPorId.get(doc.userId)?.status ?? '(desconocido)';

    filas.push({
      dni: dniPorId.get(doc.userId) ?? null,
      userId: doc.userId,
      userDocumentId: doc.id,
      documento: doc.documentSponsors?.document?.name ?? doc.documents?.name ?? '(desconocido)',
      historialIaId: ia.id,
      historialIaCreatedAt: iso(ia.createdAt),
      motivo: ia.observation ?? '',
      urlHistorialIa: ia.url,
      docStatusActual: doc.status,
      docStatusARestaurar: anterior?.status ?? null,
      historialesPosteriores: posteriores.length,
      detallePosteriores: posteriores
        .map((p) => `${p.status}@${iso(p.createdAt)} por ${p.createdById ?? 'null'}`)
        .join(' | '),
      userStatusActual,
      historialEstadoIaId: estadoIa?.id ?? null,
      userStatusIa: estadoIa?.status ?? null,
      userStatusARestaurar: estadoAnterior?.status ?? null,
      cambiosEstadoPosteriores: estadosPosteriores.length,
      detalleEstadosPosteriores: estadosPosteriores
        .map((e) => `${e.status}@${iso(e.createdAt)} por ${e.createdById ?? 'null'}`)
        .join(' | '),
      bloqueadoAlSync: ESTADOS_BLOQUEADOS_AL_SYNC.includes(userStatusActual),
      reversible: exclusiones.length === 0,
      motivoExclusion: exclusiones.length ? exclusiones.join(' | ') : null,
    });
  }

  // 6. Correos disparados por la corrida (lo único irreversible).
  const correos = await prisma.emailLog.findMany({
    where: {
      actionCode: 'DOCUMENTO_OBSERVADO',
      sentAt: { gte: new Date(primero.getTime() - 60_000), lte: new Date(ultimo.getTime() + 600_000) },
    },
    select: { id: true, status: true, recipientEmail: true, sentAt: true },
  });

  // 7. Resumen.
  const reversibles = filas.filter((f) => f.reversible);
  const conflictos = filas.filter((f) => !f.reversible);

  console.log('=== RESULTADO ===');
  console.log(`Total observaciones escritas por la corrida: ${filas.length}`);
  console.log(`  Reversibles automáticamente:               ${reversibles.length}`);
  console.log(`  Con conflicto (revisión manual):           ${conflictos.length}`);
  console.log(`Correos "DOCUMENTO_OBSERVADO" registrados:   ${correos.length} (irreversibles)\n`);

  console.log('Status actual de los documentos:  ', cuenta(filas, (f) => f.docStatusActual));
  console.log('Status a restaurar en documentos: ', cuenta(filas, (f) => f.docStatusARestaurar ?? '(ninguno)'));
  console.log('Estado que dejó la corrida:       ', cuenta(filas, (f) => f.userStatusIa ?? '(ninguno)'));
  console.log('Estado actual de participantes:   ', cuenta(filas, (f) => f.userStatusActual));
  console.log('Estado a restaurar en participantes:', cuenta(filas, (f) => f.userStatusARestaurar ?? '(ninguno)'));
  console.log('\nMotivos de la observación:', cuenta(filas, (f) =>
    f.motivo.startsWith('El documento analizado no corresponde')
      ? 'no corresponde a un pasaporte'
      : f.motivo.includes('menor de edad')
        ? 'menor de edad al emitirse'
        : f.motivo.includes('cumplía exactamente')
          ? 'cumplía 18 el mismo día'
          : f.motivo.includes('tipo de contenido declarado')
            ? 'mismatch de content-type'
            : 'otro',
  ));

  const bloqueados = filas.filter((f) => f.bloqueadoAlSync);
  console.log(`\nParticipantes en estado bloqueado al sync diario: ${bloqueados.length}`,
    cuenta(bloqueados, (f) => f.userStatusActual));

  if (conflictos.length) {
    console.log(`\n=== CONFLICTOS (${conflictos.length}) ===`);
    conflictos.forEach((c) =>
      console.log(`  DNI ${c.dni} | doc ${c.userDocumentId}\n     → ${c.motivoExclusion}` +
        (c.detallePosteriores ? `\n       docs: ${c.detallePosteriores}` : '') +
        (c.detalleEstadosPosteriores ? `\n       estados: ${c.detalleEstadosPosteriores}` : '')),
    );
  }

  // 8. Cruce contra el Excel del reporte.
  let cruce: Record<string, unknown> | null = null;
  if (excelReporte) {
    const excel = await leerExcel(excelReporte);
    const excelObservados = excel.filter((r) => r.estado === 'OBSERVADO');
    const dnisExcel = new Set(excelObservados.map((r) => r.dni));
    const dnisBd = new Set(filas.map((f) => f.dni ?? ''));
    const soloExcel = [...dnisExcel].filter((d) => !dnisBd.has(d));
    const soloBd = [...dnisBd].filter((d) => !dnisExcel.has(d));

    console.log('\n=== CRUCE CONTRA EL EXCEL ===');
    console.log(`Excel: ${excel.length} filas | OBSERVADO: ${excelObservados.length} | CORRECTO: ${excel.length - excelObservados.length}`);
    console.log(`BD: ${filas.length} observaciones`);
    console.log(`Observados en el Excel que NO están en BD: ${soloExcel.length}`, soloExcel.slice(0, 20));
    console.log(`Observaciones en BD que NO están en el Excel: ${soloBd.length}`, soloBd.slice(0, 20));

    cruce = {
      excelTotal: excel.length,
      excelObservados: excelObservados.length,
      excelCorrectos: excel.length - excelObservados.length,
      bdObservaciones: filas.length,
      soloEnExcel: soloExcel,
      soloEnBd: soloBd,
    };
  }

  // 9. Archivos de salida.
  fs.mkdirSync(salidaDir, { recursive: true });

  const jsonPath = path.join(salidaDir, 'inventario.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generadoDesde: `${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`,
        etiquetaIa: ETIQUETA_IA,
        autorCorrida: AUTOR_CORRIDA,
        ventana: { primero: iso(primero), ultimo: iso(ultimo) },
        totales: {
          observaciones: filas.length,
          reversibles: reversibles.length,
          conflictos: conflictos.length,
          correosRegistrados: correos.length,
          bloqueadosAlSync: bloqueados.length,
        },
        cruceExcel: cruce,
        otrosHistorialesDelAutorEnVentana: otrosEnVentana,
        filas,
      },
      null,
      2,
    ),
    'utf8',
  );

  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Inventario reversión 7-8');
  const encabezados = [
    'DNI', 'DOCUMENTO', 'REVERSIBLE', 'MOTIVO EXCLUSIÓN',
    'DOC STATUS ACTUAL', 'DOC STATUS A RESTAURAR', 'HIST. POSTERIORES', 'DETALLE POSTERIORES',
    'USER STATUS ACTUAL', 'USER STATUS IA', 'USER STATUS A RESTAURAR',
    'CAMBIOS ESTADO POSTERIORES', 'DETALLE ESTADOS POSTERIORES', 'BLOQUEADO AL SYNC',
    'FECHA OBSERVACIÓN', 'MOTIVO IA', 'URL', 'USER DOCUMENT ID', 'HISTORIAL IA ID', 'HIST. ESTADO IA ID',
  ];
  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });

  for (const f of filas) {
    hoja.addRow([
      f.dni, f.documento, f.reversible ? 'SI' : 'NO', f.motivoExclusion ?? '',
      f.docStatusActual, f.docStatusARestaurar ?? '', f.historialesPosteriores, f.detallePosteriores,
      f.userStatusActual, f.userStatusIa ?? '', f.userStatusARestaurar ?? '',
      f.cambiosEstadoPosteriores, f.detalleEstadosPosteriores, f.bloqueadoAlSync ? 'SI' : 'NO',
      f.historialIaCreatedAt, f.motivo, f.urlHistorialIa ?? '',
      f.userDocumentId, f.historialIaId, f.historialEstadoIaId ?? '',
    ]);
  }
  hoja.columns.forEach((col, i) => {
    col.width = [12, 20, 11, 50, 20, 22, 18, 50, 22, 18, 24, 26, 50, 18, 24, 60, 60, 38, 38, 38][i] ?? 18;
  });

  const excelPath = path.join(salidaDir, 'inventario-reversion.xlsx');
  await wb.xlsx.writeFile(excelPath);

  console.log('\n=== ARCHIVOS GENERADOS ===');
  console.log(`  ${jsonPath}`);
  console.log(`  ${excelPath}`);
  console.log('\nNo se escribió NADA en la base de datos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
