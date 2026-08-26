import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../src/app.module';
import {
  IUserDocumentsRepository,
  ParticipantSponsorInfo,
  ProcesoAbiertoInfo,
  USER_DOCUMENTS_REPOSITORY,
} from '../src/modules/user-documents/domain/user-documents.repository';
import {
  AAG_SPONSOR_CODE,
  ASPIRE_SPONSOR_CODE,
  CENET_SPONSOR_CODE,
  FOLDER_NAME_SEPARATOR,
  INTRAX_SPONSOR_CODE,
  SPONSOR_CODES_SOPORTADOS,
  SponsorDocumentBuilder,
  UNITED_SPONSOR_CODE,
  VacationLetterFile,
} from '../src/modules/user-documents/application/services/sponsor-document-builder.service';
import { SponsorPackageEngine } from '../src/modules/user-documents/application/services/sponsor-package-engine.service';
import { DownloadDocumentsBySponsorUseCase } from '../src/modules/user-documents/application/use-cases/download-documents-by-sponsor.use-case';
import { envs } from '../src/config/envs';
import { AwsS3Service } from '../src/shared/aws/aws-s3.service';

/**
 * Criterio de aceptación de la entrega 3: **los dos caminos tienen que producir el mismo árbol con
 * datos reales**.
 *
 * El test de paridad (`sponsor-package-parity.spec.ts`) ya prueba que el motor configurable arma el
 * mismo plan que el histórico, pero con datos sintéticos y un ensamblador de mentira. Lo que ese
 * test no puede cubrir es tu S3 y tus PDFs: un documento con extensión que no corresponde a su
 * contenido, un PDF corrupto, un TIFF que hay que reconvertir. Esto corre los dos caminos de verdad,
 * bajando los archivos reales, y compara lo que sale.
 *
 * NO escribe nada y NO depende de la flag: instancia los dos caminos a la vez y los compara.
 *
 * Compara los DOS endpoints de descarga:
 *
 *   - **Masiva**: se instancian los dos caminos a la vez, sin pasar por la flag.
 *   - **Individual**: se ejecuta el caso de uso REAL dos veces, alternando
 *     `SPONSOR_PACKAGES_FROM_DB` entre llamadas. Así el test cubre también la rama del `execute`,
 *     no solo el motor — si la rama estuviera mal cableada, reconstruir el camino a mano en este
 *     script lo taparía.
 *
 * Uso:
 *   npm run compare:sponsor-packages                    # 2 DNIs por sponsor, elegidos solos
 *   npm run compare:sponsor-packages -- --por-sponsor=5
 *   npm run compare:sponsor-packages -- --dnis=60775795,60991200
 *
 * No escribe nada: ni en base, ni en S3.
 */

function arg(nombre: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return found?.split('=')[1];
}

const POR_SPONSOR = Number(arg('por-sponsor') ?? 2);
const DNIS_EXPLICITOS = arg('dnis')?.split(',').map((d) => d.trim()).filter(Boolean);

/**
 * La descarga individual de AAG sube el VacationLetter a S3 en los dos caminos. Eso es un efecto de
 * lado —dejar constancia del adjunto—, no parte de lo que se está comparando, así que durante la
 * comparación se anula: se verifica toda la lógica sin escribir archivos de prueba en el bucket.
 *
 * Solo se anula la SUBIDA. Las descargas siguen siendo reales: sin los archivos de verdad no habría
 * nada que comparar.
 */
function anularSubidasAS3(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): void {
  const s3 = app.get(AwsS3Service);
  s3.uploadOne = () =>
    Promise.resolve({ url: 'stub://comparacion-no-sube-nada', key: 'stub' });
}

/** Un PDF mínimo y válido que hace de VacationLetter. Los dos caminos reciben exactamente estos bytes. */
async function fakeVacationLetter(): Promise<VacationLetterFile> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return {
    buffer: Buffer.from(await doc.save()),
    mimetype: 'application/pdf',
    originalname: 'VacationLetter.pdf',
  };
}

/** Cuántas páginas tiene un PDF. Es la comparación robusta: los bytes no son reproducibles. */
async function pageCount(buffer: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return null; // No es PDF (p. ej. el PHOTO de CENET, que sale como imagen).
  }
}

interface Entrada {
  path: string;
  bytes: number;
  paginas: number | null;
}

async function describir(entries: { path: string; buffer: Buffer }[]): Promise<Entrada[]> {
  const salida: Entrada[] = [];
  for (const { path, buffer } of entries) {
    salida.push({ path, bytes: buffer.length, paginas: await pageCount(buffer) });
  }
  return salida.sort((a, b) => a.path.localeCompare(b.path));
}

function grupoLegacy(proceso: ProcesoAbiertoInfo, sponsorCode: string): string {
  const seg = (v: string | null, fb: string) =>
    (v ?? '').replace(/[\\/:*?"<>|]/g, '-').trim() || fb;
  return `${seg(proceso.programName, 'SIN PROGRAMA')}/${seg(proceso.countryName, 'SIN PAIS')}/${sponsorCode}`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  const repo = app.get<IUserDocumentsRepository>(USER_DOCUMENTS_REPOSITORY);
  const builder = app.get(SponsorDocumentBuilder);
  const engine = app.get(SponsorPackageEngine);
  const individualUseCase = app.get(DownloadDocumentsBySponsorUseCase);
  anularSubidasAS3(app);
  const vacationLetter = await fakeVacationLetter();

  // --- elegir los participantes ---
  const dnis = DNIS_EXPLICITOS?.length
    ? DNIS_EXPLICITOS
    : await elegirDnis(app, POR_SPONSOR);

  console.log(`Comparando ${dnis.length} participante(s)\n`);

  let iguales = 0;
  let igualesIndividual = 0;
  const diferencias: string[] = [];
  const omitidos: string[] = [];

  for (const dni of dnis) {
    const participant = await repo.findParticipantInfoByDni(dni);
    if (!participant) {
      omitidos.push(`${dni}: no existe`);
      continue;
    }
    const proceso = await repo.findProcesoAbiertoByUserId(participant.id);
    if (!proceso) {
      omitidos.push(`${dni}: sin proceso abierto`);
      continue;
    }

    const sponsorCode = participant.sponsorCode ?? '';
    process.stdout.write(`${dni.padEnd(10)} ${sponsorCode.padEnd(7)} ... `);

    const [legacy, config] = await Promise.all([
      construirLegacy(builder, participant, proceso, sponsorCode, vacationLetter),
      construirConfig(engine, participant, proceso, vacationLetter),
    ]);

    const a = await describir(legacy);
    const b = await describir(config);
    const problemas = comparar(a, b).map((p) => `[masiva] ${p}`);

    // --- descarga individual: se ejecuta el caso de uso real, alternando la flag ---
    const indLegacy = await individualCon(individualUseCase, participant.id, false, vacationLetter);
    const indConfig = await individualCon(individualUseCase, participant.id, true, vacationLetter);
    const problemasInd = compararIndividual(indLegacy, indConfig).map((p) => `[individual] ${p}`);
    if (!problemasInd.length) igualesIndividual += 1;
    problemas.push(...problemasInd);

    if (!problemas.length) {
      console.log(`OK  (masiva: ${a.length} archivo(s), individual OK)`);
      iguales += 1;
    } else {
      console.log('DIFIERE');
      diferencias.push(`\n${dni} (${sponsorCode}):\n` + problemas.map((p) => `    ${p}`).join('\n'));
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Idénticos:            ${iguales}`);
  console.log(`Difieren:             ${diferencias.length}`);
  console.log(`Individual comparada: ${igualesIndividual}`);
  if (omitidos.length) {
    console.log(`Omitidos:   ${omitidos.length}`);
    omitidos.forEach((o) => console.log(`   • ${o}`));
  }
  if (diferencias.length) {
    console.log('\nDIFERENCIAS:');
    diferencias.forEach((d) => console.log(d));
    console.log('\n❌ NO prendas SPONSOR_PACKAGES_FROM_DB hasta resolver esto.\n');
  } else {
    console.log('\n✅ Los dos caminos producen el mismo árbol. Se puede prender la flag.\n');
  }

  await app.close();
  process.exit(diferencias.length ? 1 : 0);
}

/** Compara árbol, páginas y tamaño. Los bytes no son idénticos: pdf-lib estampa fecha de creación. */
function comparar(legacy: Entrada[], config: Entrada[]): string[] {
  const problemas: string[] = [];

  const rutasLegacy = new Set(legacy.map((e) => e.path));
  const rutasConfig = new Set(config.map((e) => e.path));

  for (const p of rutasLegacy) {
    if (!rutasConfig.has(p)) problemas.push(`FALTA en configurable: ${p}`);
  }
  for (const p of rutasConfig) {
    if (!rutasLegacy.has(p)) problemas.push(`SOBRA en configurable: ${p}`);
  }

  for (const e of legacy) {
    const otro = config.find((c) => c.path === e.path);
    if (!otro) continue;

    if (e.paginas !== otro.paginas) {
      problemas.push(`${e.path}: páginas ${e.paginas} vs ${otro.paginas}`);
    }
    // Tolerancia del 2%: los metadatos del PDF cambian entre corridas, el contenido no.
    const delta = Math.abs(e.bytes - otro.bytes) / Math.max(e.bytes, 1);
    if (delta > 0.02) {
      problemas.push(`${e.path}: tamaño ${e.bytes} vs ${otro.bytes} (${(delta * 100).toFixed(1)}%)`);
    }
  }

  return problemas;
}


/** Resultado de una descarga individual, normalizado para comparar. */
interface ResultadoIndividual {
  filename: string;
  contentType: string;
  entradas: Entrada[];
  error: string | null;
}

/**
 * Ejecuta la descarga individual con la flag en el valor dado y normaliza el resultado.
 *
 * Se muta `envs` a propósito: es la única forma de ejercitar la rama real del `execute` en vez de
 * reconstruir a mano lo que hace, que es justo lo que ocultaría un error de cableado.
 */
async function individualCon(
  useCase: DownloadDocumentsBySponsorUseCase,
  userId: string,
  desdeBase: boolean,
  vacationLetter: VacationLetterFile,
): Promise<ResultadoIndividual> {
  const previo = envs.SPONSOR_PACKAGES_FROM_DB;
  (envs as { SPONSOR_PACKAGES_FROM_DB: boolean }).SPONSOR_PACKAGES_FROM_DB = desdeBase;

  try {
    const r = await useCase.execute(userId, [{ slug: 'vacationLetter', ...vacationLetter }]);

    // Un paquete de carpeta llega comprimido; uno de archivo suelto, tal cual.
    const entradas: { path: string; buffer: Buffer }[] =
      r.contentType === 'application/zip'
        ? await (async () => {
            const zip = await JSZip.loadAsync(r.buffer);
            const salida: { path: string; buffer: Buffer }[] = [];
            for (const ruta of Object.keys(zip.files).sort()) {
              if (zip.files[ruta].dir) continue;
              salida.push({ path: ruta, buffer: await zip.files[ruta].async('nodebuffer') });
            }
            return salida;
          })()
        : [{ path: r.filename, buffer: r.buffer }];

    return {
      filename: r.filename,
      contentType: r.contentType,
      entradas: await describir(entradas),
      error: null,
    };
  } catch (e) {
    // Que los dos caminos fallen por lo mismo también es paridad: el participante sin documentos
    // tiene que seguir dando 404 y no un ZIP vacío.
    return {
      filename: '',
      contentType: '',
      entradas: [],
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    (envs as { SPONSOR_PACKAGES_FROM_DB: boolean }).SPONSOR_PACKAGES_FROM_DB = previo;
  }
}

function compararIndividual(legacy: ResultadoIndividual, config: ResultadoIndividual): string[] {
  const problemas: string[] = [];

  if (legacy.error || config.error) {
    if (legacy.error && config.error) {
      if (legacy.error !== config.error) {
        problemas.push(`error distinto: "${legacy.error}" vs "${config.error}"`);
      }
      return problemas;
    }
    problemas.push(
      legacy.error
        ? `el histórico falla ("${legacy.error}") y el configurable devuelve ${config.entradas.length} archivo(s)`
        : `el configurable falla ("${config.error}") y el histórico devuelve ${legacy.entradas.length} archivo(s)`,
    );
    return problemas;
  }

  if (legacy.filename !== config.filename) {
    problemas.push(`nombre del archivo: "${legacy.filename}" vs "${config.filename}"`);
  }
  if (legacy.contentType !== config.contentType) {
    problemas.push(`content-type: ${legacy.contentType} vs ${config.contentType}`);
  }
  problemas.push(...comparar(legacy.entradas, config.entradas));

  return problemas;
}

async function construirLegacy(
  builder: SponsorDocumentBuilder,
  participant: ParticipantSponsorInfo,
  proceso: ProcesoAbiertoInfo,
  sponsorCode: string,
  vacationLetter: VacationLetterFile,
): Promise<{ path: string; buffer: Buffer }[]> {
  const grupo = grupoLegacy(proceso, sponsorCode);

  if (sponsorCode === ASPIRE_SPONSOR_CODE) {
    const buffer = await builder.buildAspirePdf(participant.id);
    if (!buffer) return [];
    return [{ path: `${grupo}/${builder.buildBaseFilename(participant)}.pdf`, buffer }];
  }

  const outputs =
    sponsorCode === UNITED_SPONSOR_CODE
      ? await builder.buildUnitedOutputs(participant.id)
      : sponsorCode === INTRAX_SPONSOR_CODE
        ? await builder.buildIntraxOutputs(participant.id)
        : sponsorCode === CENET_SPONSOR_CODE
          ? await builder.buildCenetOutputs(participant.id)
          : sponsorCode === AAG_SPONSOR_CODE
            ? await builder.buildAagOutputs(participant.id, vacationLetter)
            : [];

  const base = builder.buildBaseFilename(participant, FOLDER_NAME_SEPARATOR);
  return outputs.map(({ filename, buffer }) => ({ path: `${grupo}/${base}/${filename}`, buffer }));
}

async function construirConfig(
  engine: SponsorPackageEngine,
  participant: ParticipantSponsorInfo,
  proceso: ProcesoAbiertoInfo,
  vacationLetter: VacationLetterFile,
): Promise<{ path: string; buffer: Buffer }[]> {
  const catalog = await engine.loadCatalog([participant.sponsorCode]);
  const paquete = catalog.resolve(participant.sponsorCode, {
    programId: proceso.programId,
    countryId: proceso.countryId,
  });
  if (!paquete) return [];

  const { entries } = await engine.buildForParticipant({
    userId: participant.id,
    participant,
    proceso,
    paquete,
    attached: [{ slug: 'vacationLetter', ...vacationLetter }],
  });

  const grupo = engine.buildGroupPath(paquete, participant, proceso);
  return entries.map(({ path, buffer }) => ({ path: `${grupo}/${path}`, buffer }));
}

/** N participantes por sponsor, todos con ciclo abierto y DNI. */
async function elegirDnis(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  porSponsor: number,
): Promise<string[]> {
  const { PrismaService } = await import('../src/shared/prisma/prisma.service');
  const prisma = app.get(PrismaService);

  const dnis: string[] = [];
  for (const code of SPONSOR_CODES_SOPORTADOS) {
    const procesos = await prisma.proceso.findMany({
      where: { activo: true, sponsor: { code } },
      select: { participanteId: true },
      take: porSponsor * 3,
    });
    const persons = await prisma.person.findMany({
      where: { id: { in: procesos.map((p) => p.participanteId) }, dni: { not: null } },
      select: { dni: true },
      take: porSponsor,
    });
    dnis.push(...persons.map((p) => p.dni!));
  }
  return dnis;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
