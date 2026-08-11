import 'dotenv/config';
import ExcelJS from 'exceljs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/** SOLO LECTURA: cruza las observaciones escritas en BD contra el Excel del reporte. */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const ETIQUETA_IA = '6de02d0d-a5ef-40c7-8488-7cf604a16d43';
const excelPath = process.argv[2];

async function main() {
  const enBd = await prisma.$queryRaw<{ dni: string | null; userId: string; historyId: string; createdAt: Date }[]>`
    SELECT p.dni AS dni, ud.userId AS userId, h.id AS historyId, h.created_at AS createdAt
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud ON ud.id = h.userDocumentsId
    LEFT JOIN Person p ON p.id = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
    ORDER BY h.created_at
  `;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);
  const sheet = wb.worksheets[0];
  const filas: { dni: string; observado: string; motivo: string }[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const txt = (n: number) => {
      const c = row.getCell(n).value as unknown;
      if (c && typeof c === 'object' && 'text' in (c as object)) return String((c as { text: string }).text);
      return c == null ? '' : String(c);
    };
    filas.push({ dni: txt(1), observado: txt(2), motivo: txt(3) });
  });

  const siExcel = filas.filter((f) => f.observado === 'SI');
  const fallidos = siExcel.filter((f) => f.motivo.includes('No se pudo registrar la observación'));
  const escritosEsperados = siExcel.filter((f) => !f.motivo.includes('No se pudo registrar la observación'));

  const dnisBd = new Set(enBd.map((r) => r.dni ?? ''));
  const dnisEsperados = new Set(escritosEsperados.map((f) => f.dni));

  const enBdNoEnExcel = [...dnisBd].filter((d) => !dnisEsperados.has(d));
  const enExcelNoEnBd = [...dnisEsperados].filter((d) => !dnisBd.has(d));

  console.log('=== CRUCE BD vs EXCEL ===');
  console.log('Filas totales en Excel:', filas.length);
  console.log('Observados SI en Excel:', siExcel.length);
  console.log('  de los cuales FALLARON al escribir:', fallidos.length);
  console.log('  escritura esperada en BD:', escritosEsperados.length);
  console.log('Historiales con etiqueta IA en BD:', enBd.length);
  console.log('\nEn BD pero NO en el Excel (=> el Excel es parcial):', enBdNoEnExcel.length);
  console.log('  ', enBdNoEnExcel.slice(0, 20).join(', '));
  console.log('En Excel pero NO en BD (=> escritura perdida):', enExcelNoEnBd.length);
  console.log('  ', enExcelNoEnBd.slice(0, 20).join(', '));
  console.log('\nPrimer historial:', enBd[0]?.createdAt, '| Último:', enBd[enBd.length - 1]?.createdAt);
  console.log('DNIs de los que fallaron:', fallidos.map((f) => f.dni).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
