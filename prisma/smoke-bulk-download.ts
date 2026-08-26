import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../src/app.module';
import { envs } from '../src/config/envs';
import { BulkDownloadDocumentsBySponsorUseCase } from '../src/modules/user-documents/application/use-cases/bulk-download-documents-by-sponsor.use-case';

/**
 * Smoke test de la descarga masiva **tal como la ejecuta el controller**: mismo caso de uso, misma
 * rama de la flag, mismos datos. Sirve para confirmar en el entorno real que
 * `SPONSOR_PACKAGES_FROM_DB` está enrutando a donde se cree y que el ZIP sale bien.
 *
 * A diferencia de `compare-sponsor-packages.ts` —que instancia los dos caminos a la vez para
 * compararlos— esto ejecuta UNO solo: el que la flag elija. Es la verificación de que la palanca
 * está conectada.
 *
 * Imprime el árbol del ZIP y el detalle de omitidos, que es exactamente lo que viaja en el header
 * `X-Skipped-Participants`.
 *
 * NO escribe nada en base. Sí baja archivos de S3.
 *
 * Uso:
 *   npm run smoke:bulk-download -- --dnis=60775795,73056147,123456
 */

const dnisArg = process.argv.find((a) => a.startsWith('--dnis='))?.split('=')[1];
const DNIS = (dnisArg ?? '').split(',').map((d) => d.trim()).filter(Boolean);

async function fakeVacationLetter() {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return {
    buffer: Buffer.from(await doc.save()),
    mimetype: 'application/pdf',
    originalname: 'VacationLetter.pdf',
  };
}

async function main(): Promise<void> {
  if (!DNIS.length) {
    console.error('Falta --dnis=...');
    process.exit(1);
  }

  console.log(`SPONSOR_PACKAGES_FROM_DB = ${envs.SPONSOR_PACKAGES_FROM_DB}`);
  console.log(`Camino activo: ${envs.SPONSOR_PACKAGES_FROM_DB ? 'CONFIGURABLE (base de datos)' : 'HISTORICO (constantes)'}\n`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const useCase = app.get(BulkDownloadDocumentsBySponsorUseCase);

  const inicio = Date.now();
  const result = await useCase.execute([...DNIS], [{ slug: 'vacationLetter', ...(await fakeVacationLetter()) }]);
  const ms = Date.now() - inicio;

  const zip = await JSZip.loadAsync(result.buffer);
  const rutas = Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort();

  console.log(`ZIP: ${result.filename}  ${(result.buffer.length / 1024).toFixed(0)} KB  (${ms} ms)`);
  console.log(`Archivos: ${rutas.length}\n`);
  rutas.forEach((r) => console.log(`  ${r}`));

  console.log(`\nOmitidos (esto es lo que va en X-Skipped-Participants): ${result.skipped.length}`);
  for (const s of result.skipped) {
    console.log(`  ${s.dni.padEnd(12)} ${(s.fullName ?? '—').padEnd(38)} ${s.reason}`);
  }

  // El header viaja URI-encoded: se verifica que el front pueda decodificarlo.
  const header = encodeURIComponent(JSON.stringify(result.skipped));
  console.log(`\nTamaño del header: ${header.length} bytes`);
  const round = JSON.parse(decodeURIComponent(header)) as unknown[];
  console.log(`Round-trip del header: ${round.length === result.skipped.length ? 'OK' : 'FALLA'}`);

  await app.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
