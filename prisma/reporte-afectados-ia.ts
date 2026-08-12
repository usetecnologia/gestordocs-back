import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * REPORTE SOLO LECTURA — Excel con todos los participantes afectados por la corrida de revisión
 * masiva de pasaportes del 4/8/2026.
 *
 * Por cada documento observado por el API: quién es el participante, en qué estado estaba su
 * documento ANTES de la corrida, a qué estado lo pasó la IA, y si DESPUÉS alguien lo tocó a mano
 * (lo aceptó, lo volvió a observar o subió uno nuevo).
 *
 *   npx ts-node -r tsconfig-paths/register prisma/reporte-afectados-ia.ts
 *
 * No escribe nada en la base. Genera `reversion-ia/afectados-revision-ia.xlsx`.
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
/** Autor de la corrida. Es también el usuario "sistema" que usan el cron diario y el autologin. */
const AUTOR_CORRIDA = 'd5165eff-2df4-4a87-a65e-3ea50cf4ad3d';
const VENTANA_INICIO = '2026-08-04 17:49:00';
const VENTANA_FIN = '2026-08-04 21:47:00';
const OUT_DIR = 'reversion-ia';

/** Estados que el sync diario NO reevalúa (STATUSES_LOCKED_FROM_DOCUMENT_SYNC del backend). */
const ESTADOS_BLOQUEADOS = new Set([
  'ENVIADO_SPONSOR',
  'OBSERVADO_SPONSOR',
  'RECHAZADO_SPONSOR',
  'APROBADO_SPONSOR',
  'DS2019_EMITIDO',
  'RETENIDO_USE',
  'INACTIVO',
]);

interface FilaIA {
  historialIaId: string;
  iaCreatedAt: Date;
  observation: string | null;
  userDocumentId: string;
  userId: string;
  documento: string | null;
  docStatusActual: string;
  dni: string | null;
  firstname: string | null;
  middlename: string | null;
  lastfathername: string | null;
  lastmothername: string | null;
  estadoDocAntes: string | null;
}

const nombreCompleto = (f: FilaIA) =>
  [f.firstname, f.middlename, f.lastfathername, f.lastmothername]
    .filter((p) => p && p.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const fecha = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');

async function main() {
  console.log('Leyendo las observaciones de la corrida del 4/8...');

  // Se filtra por etiqueta + autor + ventana: la etiqueta sola ya no alcanza, porque el 5/8 alguien
  // del equipo la usó a mano en una observación que no pertenece a esta corrida.
  const filas = await prisma.$queryRaw<FilaIA[]>`
    SELECT h.id            AS historialIaId,
           h.created_at    AS iaCreatedAt,
           h.observation   AS observation,
           ud.id           AS userDocumentId,
           ud.userId       AS userId,
           d.name          AS documento,
           ud.status       AS docStatusActual,
           p.dni           AS dni,
           p.firstname     AS firstname,
           p.middlename    AS middlename,
           p.lastfathername AS lastfathername,
           p.lastmothername AS lastmothername,
           (SELECT h2.status FROM UserDocumentHistory h2
             WHERE h2.userDocumentsId = ud.id AND h2.created_at < h.created_at
             ORDER BY h2.created_at DESC, h2.id DESC LIMIT 1) AS estadoDocAntes
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    LEFT JOIN documents d      ON d.id = ud.documentId
    LEFT JOIN Person p         ON p.id = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND h.created_by_id = ${AUTOR_CORRIDA}
      AND h.created_at BETWEEN ${VENTANA_INICIO} AND ${VENTANA_FIN}
    ORDER BY p.dni
  `;
  console.log(`Observaciones de la corrida: ${filas.length}`);

  const docIds = filas.map((f) => f.userDocumentId);
  const userIds = filas.map((f) => f.userId);

  // Historiales posteriores a la observación de la IA (cualquier movimiento sobre el documento).
  const posterioresReales = await prisma.userDocumentHistory.findMany({
    where: {
      userDocumentsId: { in: docIds },
      createdAt: { gt: new Date(`${VENTANA_INICIO}Z`) },
    },
    select: {
      id: true,
      userDocumentsId: true,
      status: true,
      createdAt: true,
      createdById: true,
      observation: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const iaIds = new Set(filas.map((f) => f.historialIaId));
  const posterioresPorDoc = new Map<string, typeof posterioresReales>();
  const iaPorDoc = new Map(filas.map((f) => [f.userDocumentId, f.iaCreatedAt]));

  for (const p of posterioresReales) {
    if (iaIds.has(p.id)) continue; // la propia fila de la IA
    const iaAt = iaPorDoc.get(p.userDocumentsId);
    if (!iaAt || p.createdAt <= iaAt) continue; // anteriores a la observación
    const list = posterioresPorDoc.get(p.userDocumentsId) ?? [];
    list.push(p);
    posterioresPorDoc.set(p.userDocumentsId, list);
  }

  // Estado del participante: el que tenía antes de la corrida y el actual.
  const estados = await prisma.userHistoryStatus.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const estadosPorUser = new Map<string, { status: string; createdAt: Date }[]>();
  for (const e of estados) {
    const list = estadosPorUser.get(e.userId) ?? [];
    list.push({ status: String(e.status), createdAt: e.createdAt });
    estadosPorUser.set(e.userId, list);
  }

  const usuariosActuales = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, status: true },
  });
  const estadoActualPorUser = new Map(usuariosActuales.map((u) => [u.id, String(u.status)]));

  // Nombres de quienes tocaron los documentos después.
  const autores = [
    ...new Set(
      [...posterioresPorDoc.values()].flat().map((p) => p.createdById).filter((v): v is string => !!v),
    ),
  ];
  const personasAutor = await prisma.person.findMany({
    where: { id: { in: autores } },
    select: { id: true, firstname: true, lastfathername: true, dni: true },
  });
  const usuariosAutor = await prisma.user.findMany({
    where: { id: { in: autores } },
    select: { id: true, username: true, email: true },
  });
  const nombreAutor = new Map<string, string>();
  for (const u of usuariosAutor) nombreAutor.set(u.id, u.username || u.email || u.id);
  for (const p of personasAutor) {
    nombreAutor.set(p.id, [p.firstname, p.lastfathername].filter(Boolean).join(' ') || p.dni || p.id);
  }

  console.log('Generando Excel...');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Afectados revisión IA');

  const columnas = [
    { header: 'DNI', width: 14 },
    { header: 'NOMBRE COMPLETO', width: 38 },
    { header: 'DOCUMENTO', width: 22 },
    { header: 'ESTADO DEL DOC ANTES DE LA CORRIDA', width: 20 },
    { header: 'ESTADO QUE PUSO EL API', width: 18 },
    { header: 'ESTADO ACTUAL DEL DOC', width: 20 },
    { header: '¿LO TOCARON DESPUÉS?', width: 22 },
    { header: 'QUÉ HICIERON DESPUÉS', width: 24 },
    { header: 'QUIÉN', width: 26 },
    { header: 'CUÁNDO', width: 18 },
    { header: 'ESTADO PARTICIPANTE ANTES', width: 24 },
    { header: 'ESTADO PARTICIPANTE ACTUAL', width: 24 },
    { header: '¿EL SYNC LE RECALCULA EL ESTADO?', width: 30 },
    { header: 'MOTIVO DE LA OBSERVACIÓN', width: 70 },
    { header: 'FECHA DE LA OBSERVACIÓN', width: 18 },
    { header: 'ID DEL DOCUMENTO', width: 38 },
  ];
  const headerRow = sheet.addRow(columnas.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  headerRow.height = 32;

  let tocadosManual = 0;
  let tocadosAuto = 0;

  for (const f of filas) {
    const posts = posterioresPorDoc.get(f.userDocumentId) ?? [];
    const ultimo = posts.length ? posts[posts.length - 1] : null;

    const hayManual = posts.some((p) => p.createdById && p.createdById !== AUTOR_CORRIDA);
    let tocado: string;
    if (!posts.length) tocado = 'NO';
    else if (hayManual) {
      tocado = 'SÍ — MANUAL';
      tocadosManual++;
    } else {
      tocado = 'SÍ — automático (sync)';
      tocadosAuto++;
    }

    const queHicieron = posts.length
      ? posts.map((p) => p.status).join(' → ')
      : '';
    const quien = ultimo?.createdById
      ? (nombreAutor.get(ultimo.createdById) ?? ultimo.createdById) +
        (ultimo.createdById === AUTOR_CORRIDA ? ' (usuario del sistema)' : '')
      : '';

    // Estado del participante justo antes de la observación de la IA.
    const historialEstados = estadosPorUser.get(f.userId) ?? [];
    const previos = historialEstados.filter((e) => e.createdAt < f.iaCreatedAt);
    const estadoAntes = previos.length ? previos[previos.length - 1].status : '';
    const estadoActual = estadoActualPorUser.get(f.userId) ?? '';

    const recalcula = ESTADOS_BLOQUEADOS.has(estadoActual)
      ? `NO — ${estadoActual} está bloqueado al sync`
      : 'SÍ';

    const row = sheet.addRow([
      f.dni ?? '',
      nombreCompleto(f),
      f.documento ?? '(sin nombre)',
      f.estadoDocAntes ?? '(sin historial previo)',
      'OBSERVADO',
      f.docStatusActual,
      tocado,
      queHicieron,
      quien,
      ultimo ? fecha(ultimo.createdAt) : '',
      estadoAntes,
      estadoActual,
      recalcula,
      f.observation ?? '',
      fecha(f.iaCreatedAt),
      f.userDocumentId,
    ]);

    row.alignment = { vertical: 'top', wrapText: true };
    if (hayManual) {
      // Resaltado: son los casos donde alguien ya trabajó sobre el documento después del error.
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
      });
    }
  }

  sheet.columns.forEach((col, i) => {
    col.width = columnas[i].width;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

  // Hoja de resumen.
  const resumen = workbook.addWorksheet('Resumen');
  const filasResumen: [string, string | number][] = [
    ['Corrida', 'POST /api/v1/user-documents/revision-masiva-pasaporte'],
    ['Fecha de la corrida (UTC)', '2026-08-04 17:49:04 → 21:46:43'],
    ['Documentos observados por el API', filas.length],
    ['', ''],
    ['Sin tocar después (revertibles)', filas.length - tocadosManual - tocadosAuto],
    ['Tocados MANUALMENTE después', tocadosManual],
    ['Tocados solo por el sync automático', tocadosAuto],
    ['', ''],
    ['Nota', 'Las filas resaltadas en amarillo son las que alguien tocó a mano después de la corrida.'],
    [
      'Nota',
      'El usuario d5165eff-2df4-4a87-a65e-3ea50cf4ad3d es el "usuario del sistema": lo usan el cron diario de las 02:00 y el autologin, y es también el que figura como autor de la corrida.',
    ],
    [
      'Nota',
      'Estado del participante: el sync diario lo recalcula a partir de sus documentos, salvo en los estados bloqueados (ENVIADO_SPONSOR, OBSERVADO_SPONSOR, RECHAZADO_SPONSOR, APROBADO_SPONSOR, DS2019_EMITIDO, RETENIDO_USE, INACTIVO).',
    ],
  ];
  filasResumen.forEach(([k, v]) => resumen.addRow([k, v]));
  resumen.getColumn(1).width = 38;
  resumen.getColumn(2).width = 110;
  resumen.getColumn(2).alignment = { wrapText: true };
  resumen.getRow(1).font = { bold: true };

  mkdirSync(OUT_DIR, { recursive: true });
  const out = `${OUT_DIR}/afectados-revision-ia.xlsx`;
  await workbook.xlsx.writeFile(out);

  console.log(`\n=== Resumen ===`);
  console.log(`Documentos observados por el API:      ${filas.length}`);
  console.log(`  Sin tocar después:                   ${filas.length - tocadosManual - tocadosAuto}`);
  console.log(`  Tocados MANUALMENTE después:         ${tocadosManual}`);
  console.log(`  Tocados solo por el sync automático: ${tocadosAuto}`);
  console.log(`\nExcel generado: ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
