import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 1 — Inventario de la reversión de la revisión masiva de pasaportes del 4/8/2026.
 *
 * SOLO LECTURA: este script no escribe una sola fila en la base. Su única salida son archivos
 * locales (JSON + Excel) con el mapa exacto de lo que habría que revertir y de lo que NO se debe
 * tocar.
 *
 * Contexto completo: docs/PENDIENTE-revision-masiva-pasaportes.md
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia-01-inventario.ts [carpeta-salida]
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

// Estados que pudo dejar TerminarRevisionUseCase al observar (ver setObservado).
const ESTADOS_OBSERVADO = ['OBSERVADO', 'OBSERVADO_SPONSOR'];

// La corrida llama a terminarRevision inmediatamente después de escribir la observación. Se acota
// la búsqueda del cambio de estado a esa vecindad para no confundirlo con el job diario ni con
// cambios hechos por personas, que caen muy lejos en el tiempo.
const MARGEN_ANTES_MS = 5_000;
const MARGEN_DESPUES_MS = 180_000;

const salidaDir = process.argv[2] ?? path.join(process.cwd(), 'reversion-ia');

interface FilaInventario {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  documento: string;
  // --- documento
  historialIaId: string;
  historialIaCreatedAt: string;
  motivo: string;
  urlHistorialIa: string | null;
  docStatusActual: string;
  docStatusARestaurar: string | null;
  historialesPosteriores: number;
  // --- participante
  userStatusActual: string;
  historialEstadoIaId: string | null;
  userStatusARestaurar: string | null;
  cambiosEstadoPosteriores: number;
  // --- veredicto
  reversible: boolean;
  motivoExclusion: string | null;
}

function iso(d: Date): string {
  return d.toISOString();
}

async function main() {
  console.log('=== FASE 1 — INVENTARIO (solo lectura) ===');
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}\n`);

  // 1. Historiales escritos por la corrida IA, identificados por su etiqueta.
  const etiquetados = await prisma.userDocumentHistoryEtiquetas.findMany({
    where: { etiquetaId: ETIQUETA_IA },
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
    console.log('No se encontró ningún historial con la etiqueta "Observado por IA". Nada que revertir.');
    return;
  }

  const historialesIa = etiquetados
    .map((e) => e.userDocumentHistory)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const primero = historialesIa[0].createdAt;
  const ultimo = historialesIa[historialesIa.length - 1].createdAt;
  const creadores = [...new Set(historialesIa.map((h) => h.createdById ?? '(null)'))];

  console.log(`Historiales escritos por la corrida IA: ${historialesIa.length}`);
  console.log(`Ventana: ${iso(primero)} → ${iso(ultimo)}`);
  console.log(`created_by_id: ${creadores.join(', ')}`);

  const porDia = new Map<string, number>();
  for (const h of historialesIa) {
    const dia = iso(h.createdAt).slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  console.log('Por día:', Object.fromEntries(porDia), '\n');

  // 2. Historial COMPLETO de cada documento afectado, para reconstruir el estado previo y detectar
  //    escrituras posteriores a la observación.
  const userDocumentIds = [...new Set(historialesIa.map((h) => h.userDocumentsId))];
  const todoElHistorial = await prisma.userDocumentHistory.findMany({
    where: { userDocumentsId: { in: userDocumentIds } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userDocumentsId: true, status: true, url: true, createdAt: true, createdById: true },
  });
  const historialPorDocumento = new Map<string, typeof todoElHistorial>();
  for (const h of todoElHistorial) {
    const lista = historialPorDocumento.get(h.userDocumentsId) ?? [];
    lista.push(h);
    historialPorDocumento.set(h.userDocumentsId, lista);
  }

  // 3. Estado actual y trazabilidad de estados de cada participante afectado.
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

  // 4. Armado del inventario, fila por fila.
  const filas: FilaInventario[] = [];

  for (const ia of historialesIa) {
    const doc = ia.userDocuments;
    const historial = historialPorDocumento.get(ia.userDocumentsId) ?? [];
    const indiceIa = historial.findIndex((h) => h.id === ia.id);

    const anterior = indiceIa > 0 ? historial[indiceIa - 1] : null;
    const posteriores = historial.slice(indiceIa + 1);

    const estados = estadosPorUsuario.get(doc.userId) ?? [];
    // El cambio de estado que provocó ESTA observación: el primero con estado de observación
    // registrado en la vecindad inmediata del historial IA.
    const indiceEstadoIa = estados.findIndex(
      (e) =>
        ESTADOS_OBSERVADO.includes(e.status) &&
        e.createdAt.getTime() >= ia.createdAt.getTime() - MARGEN_ANTES_MS &&
        e.createdAt.getTime() <= ia.createdAt.getTime() + MARGEN_DESPUES_MS,
    );
    const estadoIa = indiceEstadoIa >= 0 ? estados[indiceEstadoIa] : null;
    const estadoAnterior = indiceEstadoIa > 0 ? estados[indiceEstadoIa - 1] : null;
    const estadosPosteriores = indiceEstadoIa >= 0 ? estados.slice(indiceEstadoIa + 1) : [];

    const exclusiones: string[] = [];
    if (posteriores.length) {
      exclusiones.push(
        `el documento tiene ${posteriores.length} historial(es) posterior(es) a la observación IA ` +
          `(${posteriores.map((p) => `${p.status}@${iso(p.createdAt)}`).join(', ')})`,
      );
    }
    if (!anterior) {
      exclusiones.push('no hay historial anterior: no se puede reconstruir el status previo del documento');
    }
    if (!estadoIa) {
      exclusiones.push('no se encontró el cambio de estado del participante asociado a esta observación');
    }
    if (estadosPosteriores.length) {
      exclusiones.push(
        `el participante cambió de estado ${estadosPosteriores.length} vez(ces) después ` +
          `(${estadosPosteriores.map((e) => `${e.status}@${iso(e.createdAt)}`).join(', ')})`,
      );
    }
    if (estadoIa && !estadoAnterior) {
      exclusiones.push('no hay estado previo del participante para restaurar');
    }

    const nombreDoc =
      doc.documentSponsors?.document?.name ?? doc.documents?.name ?? '(desconocido)';

    filas.push({
      dni: dniPorId.get(doc.userId) ?? null,
      userId: doc.userId,
      userDocumentId: doc.id,
      documento: nombreDoc,
      historialIaId: ia.id,
      historialIaCreatedAt: iso(ia.createdAt),
      motivo: ia.observation ?? '',
      urlHistorialIa: ia.url,
      docStatusActual: doc.status,
      docStatusARestaurar: anterior?.status ?? null,
      historialesPosteriores: posteriores.length,
      userStatusActual: usuarioPorId.get(doc.userId)?.status ?? '(desconocido)',
      historialEstadoIaId: estadoIa?.id ?? null,
      userStatusARestaurar: estadoAnterior?.status ?? null,
      cambiosEstadoPosteriores: estadosPosteriores.length,
      reversible: exclusiones.length === 0,
      motivoExclusion: exclusiones.length ? exclusiones.join(' | ') : null,
    });
  }

  // 5. Correos enviados durante la corrida (irreversibles, solo informativo).
  const correos = await prisma.emailLog.count({
    where: {
      actionCode: 'DOCUMENTO_OBSERVADO',
      sentAt: { gte: new Date(primero.getTime() - 60_000), lte: new Date(ultimo.getTime() + 600_000) },
    },
  });

  // 6. Resumen por consola.
  const reversibles = filas.filter((f) => f.reversible);
  const conflictos = filas.filter((f) => !f.reversible);

  console.log('=== RESULTADO ===');
  console.log(`Total observaciones escritas por la IA: ${filas.length}`);
  console.log(`  Reversibles automáticamente:          ${reversibles.length}`);
  console.log(`  Con conflicto (revisión manual):      ${conflictos.length}`);
  console.log(`Correos "DOCUMENTO_OBSERVADO" enviados: ${correos} (NO se pueden deshacer)\n`);

  const cuenta = (lista: FilaInventario[], key: (f: FilaInventario) => string) => {
    const m = new Map<string, number>();
    for (const f of lista) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };

  console.log('Status actual de los documentos:', cuenta(filas, (f) => f.docStatusActual));
  console.log('Status a restaurar en documentos:', cuenta(filas, (f) => f.docStatusARestaurar ?? '(ninguno)'));
  console.log('Estado actual de los participantes:', cuenta(filas, (f) => f.userStatusActual));
  console.log('Estado a restaurar en participantes:', cuenta(filas, (f) => f.userStatusARestaurar ?? '(ninguno)'));

  if (conflictos.length) {
    console.log(`\n=== CONFLICTOS (${conflictos.length}) — NO se tocan en la reversión automática ===`);
    conflictos.forEach((c) =>
      console.log(`  DNI ${c.dni} | doc ${c.userDocumentId}\n     → ${c.motivoExclusion}`),
    );
  }

  // 7. Archivos de salida.
  fs.mkdirSync(salidaDir, { recursive: true });

  const jsonPath = path.join(salidaDir, 'inventario.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generadoDesde: `${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`,
        etiquetaIa: ETIQUETA_IA,
        ventana: { primero: iso(primero), ultimo: iso(ultimo) },
        creadores,
        totales: {
          observaciones: filas.length,
          reversibles: reversibles.length,
          conflictos: conflictos.length,
          correosEnviados: correos,
        },
        filas,
      },
      null,
      2,
    ),
    'utf8',
  );

  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Inventario reversión');
  const encabezados = [
    'DNI', 'DOCUMENTO', 'REVERSIBLE', 'MOTIVO EXCLUSIÓN',
    'DOC STATUS ACTUAL', 'DOC STATUS A RESTAURAR', 'HIST. POSTERIORES',
    'USER STATUS ACTUAL', 'USER STATUS A RESTAURAR', 'CAMBIOS ESTADO POSTERIORES',
    'FECHA OBSERVACIÓN', 'MOTIVO IA', 'USER DOCUMENT ID', 'HISTORIAL IA ID',
  ];
  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });

  for (const f of filas) {
    hoja.addRow([
      f.dni, f.documento, f.reversible ? 'SI' : 'NO', f.motivoExclusion ?? '',
      f.docStatusActual, f.docStatusARestaurar ?? '', f.historialesPosteriores,
      f.userStatusActual, f.userStatusARestaurar ?? '', f.cambiosEstadoPosteriores,
      f.historialIaCreatedAt, f.motivo, f.userDocumentId, f.historialIaId,
    ]);
  }
  hoja.columns.forEach((col, i) => {
    col.width = [12, 18, 11, 60, 20, 22, 18, 22, 24, 26, 24, 60, 38, 38][i] ?? 18;
  });

  const excelPath = path.join(salidaDir, 'inventario-reversion.xlsx');
  await wb.xlsx.writeFile(excelPath);

  console.log(`\n=== ARCHIVOS GENERADOS ===`);
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
