import ExcelJS from 'exceljs';

/** Verificación del Excel generado por reporte-afectados-ia.ts: filas, columnas y una muestra. */

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('reversion-ia/afectados-revision-ia.xlsx');
  const sheet = workbook.getWorksheet('Afectados revisión IA')!;

  console.log(`Hojas: ${workbook.worksheets.map((w) => w.name).join(', ')}`);
  console.log(`Filas de datos: ${sheet.rowCount - 1}`);
  console.log(`Columnas: ${sheet.columnCount}\n`);

  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((v) => String(v));
  console.log('--- Columnas ---');
  headers.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));

  const texto = (row: ExcelJS.Row, i: number) => {
    const v = row.getCell(i).value;
    return v === null || v === undefined ? '' : String(v);
  };

  console.log('\n--- Filas que alguien tocó a mano después ---');
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (texto(row, 7).includes('MANUAL')) {
      console.log(
        `  DNI ${texto(row, 1)} | ${texto(row, 2)}\n` +
          `     antes=${texto(row, 4)} → API=${texto(row, 5)} → actual=${texto(row, 6)}\n` +
          `     ${texto(row, 8)} por ${texto(row, 9)} el ${texto(row, 10)}`,
      );
    }
  }

  console.log('\n--- Filas tocadas solo por el sync automático ---');
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (texto(row, 7).includes('automático')) {
      console.log(
        `  DNI ${texto(row, 1)} | ${texto(row, 2)}\n` +
          `     antes=${texto(row, 4)} → API=${texto(row, 5)} → actual=${texto(row, 6)}\n` +
          `     ${texto(row, 8)} por ${texto(row, 9)} el ${texto(row, 10)}`,
      );
    }
  }

  console.log('\n--- Muestra de 3 filas normales ---');
  let mostradas = 0;
  for (let i = 2; i <= sheet.rowCount && mostradas < 3; i++) {
    const row = sheet.getRow(i);
    if (texto(row, 7) !== 'NO') continue;
    console.log(
      `  DNI ${texto(row, 1)} | ${texto(row, 2)} | ${texto(row, 3)}\n` +
        `     doc: ${texto(row, 4)} → ${texto(row, 5)} (actual ${texto(row, 6)}) | tocado: ${texto(row, 7)}\n` +
        `     participante: ${texto(row, 11)} → ${texto(row, 12)} | sync recalcula: ${texto(row, 13)}\n` +
        `     motivo: ${texto(row, 14).slice(0, 90)}...`,
    );
    mostradas++;
  }

  const vacios = { dni: 0, nombre: 0, estadoAntes: 0 };
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (!texto(row, 1)) vacios.dni++;
    if (!texto(row, 2)) vacios.nombre++;
    if (!texto(row, 4) || texto(row, 4).startsWith('(sin')) vacios.estadoAntes++;
  }
  console.log('\n--- Control de calidad (celdas sin dato) ---');
  console.log(`  DNI vacío:            ${vacios.dni}`);
  console.log(`  Nombre vacío:         ${vacios.nombre}`);
  console.log(`  Sin estado anterior:  ${vacios.estadoAntes}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
