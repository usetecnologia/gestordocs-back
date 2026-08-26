import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';
import { AwsS3Service } from '../src/shared/aws/aws-s3.service';
import { SELLO_TRANSLATION_PNG_BASE64 } from '../src/modules/user-documents/infrastructure/assets/sello-translation.constant';
import {
  LEGACY_PACKAGE_SPECS,
  LEGACY_STAMP_GEOMETRY,
  collectLegacySiglas,
} from '../src/modules/user-documents/application/services/legacy-package-specs';

/**
 * Siembra los cinco paquetes de descarga replicando EXACTAMENTE lo que hoy hacen las constantes de
 * `SponsorDocumentBuilder`. La descripción vive en `legacy-package-specs.ts`; este script solo la
 * baja a filas, resolviendo siglas a `Documents.id` y subiendo el sello a S3.
 *
 * Falla ruidosamente y sin escribir nada si algo no resuelve: un sponsor que no existe, una sigla
 * sin documento activo, o —el caso peligroso— una sigla con MÁS DE UN documento activo. Ese último
 * es justamente el que hoy resuelve mal `findFirst`, y sembrar "casi todo" sería peor que no
 * sembrar: dejaría una regla apuntando a un documento arbitrario sin que nadie se entere.
 *
 * Uso:
 *   npm run seed:sponsor-packages              # dry-run, no escribe nada
 *   npm run seed:sponsor-packages -- --apply   # escribe
 *   npm run seed:sponsor-packages -- --apply --replace   # borra los paquetes previos y recrea
 */

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});

const prisma = new PrismaClient({ adapter });

const SELLO_S3_FOLDER = 'sponsor-package-stamps';

interface Resolucion {
  sponsorIdByCode: Map<string, string>;
  documentIdBySiglas: Map<string, string>;
}

/**
 * Resuelve sponsors y siglas contra la base y acumula TODOS los problemas antes de decidir. Se
 * acumulan en vez de cortar en el primero para que una corrida diga de una vez todo lo que falta.
 */
async function resolver(): Promise<Resolucion> {
  const problemas: string[] = [];

  const sponsorCodes = [...new Set(LEGACY_PACKAGE_SPECS.map((s) => s.sponsorCode))];
  const sponsors = await prisma.sponsor.findMany({
    where: { code: { in: sponsorCodes } },
    select: { id: true, code: true, status: true },
  });

  const sponsorIdByCode = new Map<string, string>();
  for (const code of sponsorCodes) {
    const encontrados = sponsors.filter((s) => s.code === code);
    if (encontrados.length === 0) {
      problemas.push(`Sponsor "${code}": no existe en la tabla Sponsor.`);
      continue;
    }
    if (!encontrados[0].status) {
      console.warn(`  ! Sponsor "${code}" está inactivo — se siembra igual, pero revisalo.`);
    }
    sponsorIdByCode.set(code, encontrados[0].id);
  }

  const siglasList = collectLegacySiglas();
  const documentos = await prisma.documents.findMany({
    where: { siglasCode: { in: siglasList }, status: true },
    select: { id: true, siglasCode: true, name: true },
  });

  const documentIdBySiglas = new Map<string, string>();
  for (const siglas of siglasList) {
    const encontrados = documentos.filter((d) => d.siglasCode === siglas);

    if (encontrados.length === 0) {
      problemas.push(`Sigla "${siglas}": no hay ningún documento activo con ese siglasCode.`);
      continue;
    }
    if (encontrados.length > 1) {
      const detalle = encontrados.map((d) => `${d.id} (${d.name})`).join(', ');
      problemas.push(
        `Sigla "${siglas}": hay ${encontrados.length} documentos activos con ese siglasCode — ${detalle}. ` +
          'Hay que dejar uno solo activo antes de sembrar, o el paquete apuntaría a uno arbitrario.',
      );
      continue;
    }
    documentIdBySiglas.set(siglas, encontrados[0].id);
  }

  if (problemas.length) {
    console.error('\n❌ No se puede sembrar. Problemas encontrados:\n');
    problemas.forEach((p) => console.error(`   • ${p}`));
    console.error('\nNo se escribió nada.\n');
    process.exit(1);
  }

  return { sponsorIdByCode, documentIdBySiglas };
}

/** Sube el PNG del sello a S3 y devuelve su URL. En dry-run no sube nada. */
async function subirSello(): Promise<string> {
  if (!APPLY) return '(dry-run: no se subió el sello)';

  const s3 = new AwsS3Service();
  const { url } = await s3.uploadOne(
    {
      buffer: Buffer.from(SELLO_TRANSLATION_PNG_BASE64, 'base64'),
      mimetype: 'image/png',
      originalname: 'sello-translation.png',
    },
    SELLO_S3_FOLDER,
  );
  return url;
}

async function main(): Promise<void> {
  console.log(`Modo: ${APPLY ? 'APLICAR CAMBIOS' : 'dry-run (sin escribir nada)'}`);
  if (REPLACE) console.log('Reemplazo: se borran los paquetes previos de estos sponsors.\n');
  else console.log('');

  const { sponsorIdByCode, documentIdBySiglas } = await resolver();

  console.log('Resolución OK:');
  console.log(`  Sponsors: ${[...sponsorIdByCode.keys()].join(', ')}`);
  console.log(`  Siglas:   ${[...documentIdBySiglas.keys()].join(', ')}\n`);

  const sponsorIds = [...sponsorIdByCode.values()];
  const existentes = await prisma.sponsorPackage.findMany({
    where: { sponsorId: { in: sponsorIds }, programId: null, countryId: null },
    select: { id: true, name: true, sponsorId: true },
  });

  if (existentes.length && !REPLACE) {
    console.error(
      `❌ Ya existen ${existentes.length} paquete(s) de alcance genérico para estos sponsors:\n` +
        existentes.map((p) => `   • ${p.name} (${p.id})`).join('\n') +
        '\n\nCorré con --replace para borrarlos y recrearlos. No se escribió nada.\n',
    );
    process.exit(1);
  }

  const selloUrl = await subirSello();
  console.log(`Sello: ${selloUrl}\n`);

  let creados = 0;

  for (const spec of LEGACY_PACKAGE_SPECS) {
    const sponsorId = sponsorIdByCode.get(spec.sponsorCode)!;

    console.log(`${spec.sponsorCode} — ${spec.structure}`);
    console.log(`  carpeta: ${spec.folderPathTemplate}`);
    console.log(`  nombre:  ${spec.itemNameTemplate}`);
    for (const output of spec.outputs) {
      const fuentes = output.sources
        .map((s) => s.siglas ?? `adjunto:${s.inputSlug}`)
        .join(' + ');
      const sello = output.stampOnSiglas ? `  [sello sobre ${output.stampOnSiglas}]` : '';
      const vacio = output.emitWhenEmpty ? '  [sale aunque esté vacío]' : '';
      console.log(`    ${output.filename} (${output.mode}) <- ${fuentes}${sello}${vacio}`);
    }
    for (const input of spec.inputs) {
      console.log(`    adjunto: ${input.slug} (${input.label}, máx ${input.maxSizeMb} MB)`);
    }
    console.log('');

    if (!APPLY) continue;

    // Todo el árbol de un paquete se escribe en una transacción: o queda entero o no queda nada.
    await prisma.$transaction(async (tx) => {
      const previos = existentes.filter((p) => p.sponsorId === sponsorId);
      for (const previo of previos) {
        // Los hijos caen por CASCADE.
        await tx.sponsorPackage.delete({ where: { id: previo.id } });
      }

      const paquete = await tx.sponsorPackage.create({
        data: {
          name: spec.name,
          sponsorId,
          programId: null,
          countryId: null,
          structure: spec.structure,
          folderPathTemplate: spec.folderPathTemplate,
          itemNameTemplate: spec.itemNameTemplate,
        },
        select: { id: true },
      });

      // Los insumos van primero: las fuentes que los referencian necesitan su id.
      const inputIdBySlug = new Map<string, string>();
      for (const input of spec.inputs) {
        const creado = await tx.sponsorPackageInput.create({
          data: { packageId: paquete.id, ...input },
          select: { id: true },
        });
        inputIdBySlug.set(input.slug, creado.id);
      }

      for (const [index, output] of spec.outputs.entries()) {
        const creado = await tx.sponsorPackageOutput.create({
          data: {
            packageId: paquete.id,
            filename: output.filename,
            mode: output.mode,
            order: index,
            emitWhenEmpty: output.emitWhenEmpty,
          },
          select: { id: true },
        });

        for (const [orden, source] of output.sources.entries()) {
          await tx.sponsorPackageOutputSource.create({
            data: {
              outputId: creado.id,
              documentId: source.siglas ? documentIdBySiglas.get(source.siglas)! : null,
              inputId: source.inputSlug ? inputIdBySlug.get(source.inputSlug)! : null,
              order: orden,
              onMissing: source.onMissing,
            },
          });
        }

        if (output.stampOnSiglas) {
          await tx.sponsorPackageOutputStamp.create({
            data: {
              outputId: creado.id,
              assetUrl: selloUrl,
              onlyDocumentId: documentIdBySiglas.get(output.stampOnSiglas)!,
              ...LEGACY_STAMP_GEOMETRY,
            },
          });
        }
      }
    });

    creados += 1;
  }

  if (APPLY) {
    console.log(`✅ ${creados} paquete(s) sembrado(s).`);
    console.log('   Para activarlos: SPONSOR_PACKAGES_FROM_DB=true\n');
  } else {
    console.log('Dry-run terminado. Volvé a correr con --apply para escribir.\n');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
