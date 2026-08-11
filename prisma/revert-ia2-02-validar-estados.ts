import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 2 — Validación previa a la reversión de la corrida del 7/8/2026.
 *
 * SOLO LECTURA. Responde una pregunta concreta: si restauramos el estado exacto que cada
 * participante tenía antes de la corrida, ¿se pierde algo?
 *
 * Se pierde algo si, después de que la corrida lo marcara como observado, el participante **salió**
 * de ese estado por trabajo legítimo (una persona lo movió, subió un documento, se lo enviaron al
 * sponsor). No se pierde nada si nunca salió del estado observado: en ese caso su estado actual es
 * consecuencia de la corrida —directamente, o del cron diario reafirmándolo cada mañana porque el
 * documento seguía observado— y restaurarlo solo deshace el daño.
 *
 * Además comprueba dos cosas que el estado previo por sí solo no revela y que harían que restaurarlo
 * dejara datos incoherentes:
 *   - que el participante no tenga OTRO documento observado, ajeno a la corrida
 *   - que no tenga una observación de participante vigente (UserObservations activa)
 * En ambos casos las reglas de TerminarRevisionUseCase exigen que siga OBSERVADO, así que devolverlo
 * a PREPARACION/ENVIADO_SPONSOR lo dejaría en un estado que el propio sistema contradice.
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/revert-ia2-02-validar-estados.ts [carpeta-salida]
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

// Exclusiones ya decididas (11/8/2026):
//  - los 12 documentos que el equipo ya trabajó después de la corrida: no se tocan en absoluto
//  - de los 12 que ya estaban OBSERVADO antes: se excluyen los 2 de prueba y los 5 INACTIVO
const DNIS_YA_TRABAJADOS = [
  '72613065', '70636377', '70592556', '61345369', '60798081', '60880295',
  '60556582', '60772118', '60822745', '71161455', '61482158', '60777503',
];
const DNIS_PRUEBA = ['12345666', '12345678'];
const DNIS_INACTIVO_EXCLUIDOS = ['73254293', '71155531', '73984442', '71183524', '70487231'];
const DNIS_EXCLUIDOS = new Set([...DNIS_YA_TRABAJADOS, ...DNIS_PRUEBA, ...DNIS_INACTIVO_EXCLUIDOS]);

const salidaDir = process.argv[2] ?? path.join(process.cwd(), 'reversion-ia-2');

const iso = (d: Date) => d.toISOString();
const esHoraDelCron = (d: Date) => d.getUTCHours() === 7 && d.getUTCMinutes() < 20;

const tally = <T>(lista: T[], key: (f: T) => string) => {
  const m = new Map<string, number>();
  for (const f of lista) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};

type Veredicto =
  | 'EXCLUIDO_POR_DECISION'
  | 'SIN_CAMBIO_NECESARIO'
  | 'SEGURO'
  | 'SEGURO_CON_TRANSITO'
  | 'REVISAR_SALIO_DEL_ESTADO'
  | 'REVISAR_OTRO_DOC_OBSERVADO'
  | 'REVISAR_OBSERVACION_VIGENTE'
  | 'REVISAR_SIN_ESTADO_PREVIO';

interface FilaValidacion {
  dni: string | null;
  userId: string;
  userDocumentId: string;
  statusPrevio: string | null;
  statusQueDejoLaCorrida: string | null;
  statusActual: string;
  cambiosPosteriores: number;
  cambiosPosterioresCron: number;
  cambiosPosterioresOtros: number;
  salioDelEstadoObservado: boolean;
  transitoTemporal: string;
  otrosDocsObservados: number;
  detalleOtrosDocsObservados: string;
  observacionParticipanteVigente: boolean;
  sePerderiaAlRestaurar: string;
  veredicto: Veredicto;
}

async function main() {
  console.log('=== FASE 2 — VALIDACIÓN DE ESTADOS (solo lectura) ===');
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
  console.log(`Ejecutado con datos en vivo — cualquier cambio posterior a este momento no está aquí.\n`);

  const etiquetados = await prisma.userDocumentHistoryEtiquetas.findMany({
    where: {
      etiquetaId: ETIQUETA_IA,
      userDocumentHistory: {
        createdById: AUTOR_CORRIDA,
        createdAt: { gte: VENTANA_INICIO, lte: VENTANA_FIN },
      },
    },
    include: {
      userDocumentHistory: { include: { userDocuments: true } },
    },
  });

  const historialesIa = etiquetados
    .map((e) => e.userDocumentHistory)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  console.log(`Observaciones de la corrida: ${historialesIa.length}`);

  const userIds = [...new Set(historialesIa.map((h) => h.userDocuments.userId))];
  const userDocumentIds = new Set(historialesIa.map((h) => h.userDocumentsId));

  const [usuarios, personas, historialEstados, todosLosDocs, observacionesVigentes] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, status: true } }),
    prisma.person.findMany({ where: { id: { in: userIds } }, select: { id: true, dni: true } }),
    prisma.userHistoryStatus.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, status: true, createdAt: true, createdById: true },
    }),
    // Otros documentos observados de los afectados. `statusDocument: true` no es opcional: es el
    // filtro que aplica findByUserIdWithHistory, así que un documento inactivo observado NO influye
    // en el estado del participante y no debe contar acá (si contara, marcaría como conflicto casos
    // que el propio sistema lleva semanas calculando sin problema).
    prisma.userDocuments.findMany({
      where: { userId: { in: userIds }, status: 'OBSERVADO', statusDocument: true },
      select: {
        id: true, userId: true, status: true, statusDocument: true,
        documents: { select: { name: true } },
        documentSponsors: { select: { document: { select: { name: true } } } },
      },
    }),
    prisma.userObservations.findMany({
      where: { userId: { in: userIds }, status: true, endDate: null },
      select: { id: true, userId: true },
    }),
  ]);

  const usuarioPorId = new Map(usuarios.map((u) => [u.id, u]));
  const dniPorId = new Map(personas.map((p) => [p.id, p.dni]));
  const conObservacionVigente = new Set(observacionesVigentes.map((o) => o.userId));

  const estadosPorUsuario = new Map<string, typeof historialEstados>();
  for (const e of historialEstados) {
    const lista = estadosPorUsuario.get(e.userId) ?? [];
    lista.push(e);
    estadosPorUsuario.set(e.userId, lista);
  }

  const otrosDocsPorUsuario = new Map<string, typeof todosLosDocs>();
  for (const d of todosLosDocs) {
    if (userDocumentIds.has(d.id)) continue; // el documento de la corrida no cuenta
    const lista = otrosDocsPorUsuario.get(d.userId) ?? [];
    lista.push(d);
    otrosDocsPorUsuario.set(d.userId, lista);
  }

  const filas: FilaValidacion[] = [];

  for (const ia of historialesIa) {
    const doc = ia.userDocuments;
    const dni = dniPorId.get(doc.userId) ?? null;
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
    const posteriores = indiceEstadoIa >= 0 ? estados.slice(indiceEstadoIa + 1) : [];

    const statusActual = usuarioPorId.get(doc.userId)?.status ?? '(desconocido)';
    const otrosObservados = otrosDocsPorUsuario.get(doc.userId) ?? [];
    const tieneObservacionVigente = conObservacionVigente.has(doc.userId);

    // ¿Salió alguna vez del estado observado, o sigue (y siguió) dentro?
    const posterioresNoObservado = posteriores.filter((e) => !ESTADOS_OBSERVADO.includes(e.status));
    const salioDefinitivamente = !ESTADOS_OBSERVADO.includes(statusActual);

    let veredicto: Veredicto;
    let sePerderia = '';

    if (dni && DNIS_EXCLUIDOS.has(dni)) {
      veredicto = 'EXCLUIDO_POR_DECISION';
      sePerderia = 'no se toca (decisión del 11/8)';
    } else if (!estadoIa || !estadoAnterior) {
      veredicto = 'REVISAR_SIN_ESTADO_PREVIO';
      sePerderia = 'no hay estado previo que restaurar';
    } else if (estadoAnterior.status === statusActual) {
      // El estado previo ya es el actual: restaurarlo no escribe nada y no puede perder nada. Pasa
      // sobre todo con los INACTIVO, que el cron diario ya devolvió a su sitio. Solo hay que
      // revertir el documento y borrar el historial de la IA.
      veredicto = 'SIN_CAMBIO_NECESARIO';
      sePerderia = `nada: su estado actual (${statusActual}) ya es el previo a la corrida — no se escribe`;
    } else if (salioDefinitivamente) {
      veredicto = 'REVISAR_SALIO_DEL_ESTADO';
      sePerderia =
        `el participante está hoy en ${statusActual}, fuera del estado observado: restaurar ` +
        `${estadoAnterior.status} pisaría ese cambio`;
    } else if (otrosObservados.length) {
      veredicto = 'REVISAR_OTRO_DOC_OBSERVADO';
      sePerderia =
        `tiene ${otrosObservados.length} otro(s) documento(s) OBSERVADO ajeno(s) a la corrida: ` +
        `debe seguir OBSERVADO, no ${estadoAnterior.status}`;
    } else if (tieneObservacionVigente) {
      veredicto = 'REVISAR_OBSERVACION_VIGENTE';
      sePerderia =
        `tiene una observación de participante vigente: las reglas lo fuerzan a OBSERVADO, ` +
        `no a ${estadoAnterior.status}`;
    } else if (posterioresNoObservado.length) {
      veredicto = 'SEGURO_CON_TRANSITO';
      sePerderia =
        'nada: pasó por otro estado transitoriamente pero volvió al observado, que es el que dejó la corrida';
    } else {
      veredicto = 'SEGURO';
      sePerderia = 'nada: nunca salió del estado que le puso la corrida';
    }

    filas.push({
      dni,
      userId: doc.userId,
      userDocumentId: doc.id,
      statusPrevio: estadoAnterior?.status ?? null,
      statusQueDejoLaCorrida: estadoIa?.status ?? null,
      statusActual,
      cambiosPosteriores: posteriores.length,
      cambiosPosterioresCron: posteriores.filter((e) => esHoraDelCron(e.createdAt)).length,
      cambiosPosterioresOtros: posteriores.filter((e) => !esHoraDelCron(e.createdAt)).length,
      salioDelEstadoObservado: salioDefinitivamente,
      transitoTemporal: posterioresNoObservado
        .map((e) => `${e.status}@${iso(e.createdAt)} por ${e.createdById ?? 'null'}`)
        .join(' | '),
      otrosDocsObservados: otrosObservados.length,
      detalleOtrosDocsObservados: otrosObservados
        .map((d) => d.documentSponsors?.document?.name ?? d.documents?.name ?? d.id)
        .join(' | '),
      observacionParticipanteVigente: tieneObservacionVigente,
      sePerderiaAlRestaurar: sePerderia,
      veredicto,
    });
  }

  // ---- Resumen
  console.log('\n=== VEREDICTO POR PARTICIPANTE ===');
  console.log(tally(filas, (f) => f.veredicto));

  const seguros = filas.filter((f) => f.veredicto === 'SEGURO' || f.veredicto === 'SEGURO_CON_TRANSITO');
  const noOp = filas.filter((f) => f.veredicto === 'SIN_CAMBIO_NECESARIO');
  const revisar = filas.filter((f) => f.veredicto.startsWith('REVISAR'));
  const excluidos = filas.filter((f) => f.veredicto === 'EXCLUIDO_POR_DECISION');

  console.log(`\nSeguros para restaurar el estado exacto:  ${seguros.length}`);
  console.log(`Sin cambio de estado necesario (no-op):   ${noOp.length}`);
  console.log(`Requieren decisión antes de restaurar:    ${revisar.length}`);
  console.log(`Excluidos por decisión del 11/8:          ${excluidos.length}`);
  console.log(`                                         ────`);
  console.log(`                                          ${seguros.length + noOp.length + revisar.length + excluidos.length}`);
  console.log('\nNo-op por estado actual (ya estaban donde tocaba):', tally(noOp, (f) => f.statusActual));

  console.log('\n--- Cambios de estado posteriores a la corrida ---');
  console.log('Participantes SIN ningún cambio posterior:', filas.filter((f) => f.cambiosPosteriores === 0).length);
  console.log('Participantes CON cambios posteriores:    ', filas.filter((f) => f.cambiosPosteriores > 0).length);
  console.log('  de esos, solo en el horario del cron (07:0x UTC):',
    filas.filter((f) => f.cambiosPosteriores > 0 && f.cambiosPosterioresOtros === 0).length);
  console.log('  con al menos un cambio fuera del horario del cron:',
    filas.filter((f) => f.cambiosPosterioresOtros > 0).length);

  if (revisar.length) {
    console.log(`\n=== ${revisar.length} CASOS A REVISAR (no se restauran a ciegas) ===`);
    for (const f of revisar) {
      console.log(`  DNI ${f.dni} [${f.veredicto}]`);
      console.log(`     previo=${f.statusPrevio} · corrida=${f.statusQueDejoLaCorrida} · actual=${f.statusActual}`);
      console.log(`     → ${f.sePerderiaAlRestaurar}`);
      if (f.detalleOtrosDocsObservados) console.log(`       otros docs observados: ${f.detalleOtrosDocsObservados}`);
      if (f.transitoTemporal) console.log(`       tránsito: ${f.transitoTemporal}`);
    }
  }

  console.log('\n--- De los seguros, estado a restaurar ---');
  console.log(tally(seguros, (f) => f.statusPrevio ?? '(ninguno)'));

  console.log('\n--- Participantes con tránsito temporal fuera del estado observado ---');
  const conTransito = filas.filter((f) => f.veredicto === 'SEGURO_CON_TRANSITO');
  conTransito.forEach((f) => console.log(`  DNI ${f.dni} | ${f.transitoTemporal}`));

  // ---- Salida
  fs.mkdirSync(salidaDir, { recursive: true });
  const jsonPath = path.join(salidaDir, 'validacion-estados.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generadoDesde: `${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`,
        totales: {
          observaciones: filas.length,
          seguros: seguros.length,
          revisar: revisar.length,
          excluidos: excluidos.length,
        },
        veredictos: tally(filas, (f) => f.veredicto),
        filas,
      },
      null,
      2,
    ),
    'utf8',
  );

  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Validación estados');
  const encabezados = [
    'DNI', 'VEREDICTO', 'QUÉ SE PERDERÍA AL RESTAURAR',
    'STATUS PREVIO', 'STATUS QUE DEJÓ LA CORRIDA', 'STATUS ACTUAL',
    'CAMBIOS POSTERIORES', 'DE ESOS, DEL CRON', 'FUERA DEL CRON',
    'SALIÓ DEL ESTADO OBSERVADO', 'TRÁNSITO TEMPORAL',
    'OTROS DOCS OBSERVADOS', 'DETALLE OTROS DOCS', 'OBSERVACIÓN PARTICIPANTE VIGENTE',
    'USER ID', 'USER DOCUMENT ID',
  ];
  const filaEncabezado = hoja.addRow(encabezados);
  filaEncabezado.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  });
  for (const f of filas) {
    hoja.addRow([
      f.dni, f.veredicto, f.sePerderiaAlRestaurar,
      f.statusPrevio ?? '', f.statusQueDejoLaCorrida ?? '', f.statusActual,
      f.cambiosPosteriores, f.cambiosPosterioresCron, f.cambiosPosterioresOtros,
      f.salioDelEstadoObservado ? 'SI' : 'NO', f.transitoTemporal,
      f.otrosDocsObservados, f.detalleOtrosDocsObservados,
      f.observacionParticipanteVigente ? 'SI' : 'NO',
      f.userId, f.userDocumentId,
    ]);
  }
  hoja.columns.forEach((col, i) => {
    col.width = [12, 30, 70, 22, 26, 20, 20, 18, 16, 26, 60, 20, 40, 30, 38, 38][i] ?? 18;
  });
  const excelPath = path.join(salidaDir, 'validacion-estados.xlsx');
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
