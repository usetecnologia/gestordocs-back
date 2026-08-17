import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Simulación (SOLO LECTURA) del filtrado de documentos por programa y país.
 *
 * Para cada combinación real de (programa, país, sponsor) que existe entre los participantes,
 * cuenta cuántos documentos ve hoy (regla vieja: solo sponsor) frente a cuántos vería con la
 * regla nueva (sponsor + programa + país), y marca las combinaciones afectadas.
 *
 * Correrlo apuntando a producción ANTES de desplegar: un delta negativo significa que esos
 * participantes perderían documentos de su expediente.
 *
 * No modifica ninguna fila. Ejecutar: npm run inspect:filtro-documentos
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const sponsorOr = (sponsorCode: string | null) => [
  { documentSponsors: { some: { sponsor: { code: sponsorCode ?? '' }, status: true } } },
  { documentSponsors: { none: { status: true } } },
];

// Regla ACTUAL en produccion: solo sponsor.
const contarHoy = (sponsorCode: string | null) =>
  prisma.documents.count({ where: { OR: sponsorOr(sponsorCode) } });

// Regla NUEVA: sponsor + programa + pais.
const contarNuevo = (programId: string, countryId: string, sponsorCode: string | null) =>
  prisma.documents.count({
    where: {
      documentPrograms: {
        some: {
          programId,
          status: true,
          descriptions: { some: { countries: { some: { countryId } } } },
        },
      },
      OR: sponsorOr(sponsorCode),
    },
  });

async function main(): Promise<void> {
  const programas = await prisma.program.findMany({ select: { id: true, code: true } });
  const sponsors = await prisma.sponsor.findMany({ select: { id: true, code: true } });
  const combos = await prisma.user.groupBy({
    by: ['programId', 'countryId', 'sponsorId'],
    _count: { _all: true },
  });

  console.log('\nPROGRAMA      PAIS   SPONSOR         PART.   HOY   NUEVO   DELTA');
  console.log('─'.repeat(70));

  let partSinCambio = 0;
  let partAfectados = 0;

  for (const c of combos) {
    const p = programas.find((x) => x.id === c.programId);
    const sp = sponsors.find((s) => s.id === c.sponsorId);
    const pais = c.countryId
      ? await prisma.country.findUnique({ where: { id: c.countryId }, select: { code: true } })
      : null;

    const hoy = await contarHoy(sp?.code ?? null);

    if (!c.programId || !c.countryId) {
      console.log(
        `${'SIN PROG'.padEnd(13)} ${'—'.padEnd(6)} ${(sp?.code ?? 'sin sponsor').padEnd(15)} ` +
          `${String(c._count._all).padStart(5)}  ${String(hoy).padStart(4)}   ${'omitido'.padStart(5)}   —`,
      );
      continue;
    }

    const nuevo = await contarNuevo(c.programId, c.countryId, sp?.code ?? null);
    const delta = nuevo - hoy;
    if (delta === 0) partSinCambio += c._count._all;
    else partAfectados += c._count._all;

    console.log(
      `${(p?.code ?? '—').padEnd(13)} ${(pais?.code ?? '—').padEnd(6)} ${(sp?.code ?? 'sin sponsor').padEnd(15)} ` +
        `${String(c._count._all).padStart(5)}  ${String(hoy).padStart(4)}   ${String(nuevo).padStart(5)}   ` +
        `${delta === 0 ? 'sin cambio' : delta > 0 ? `+${delta}` : `${delta}  ← AFECTADO`}`,
    );
  }

  console.log('─'.repeat(70));
  console.log(`Participantes sin cambio: ${partSinCambio}`);
  console.log(`Participantes afectados:  ${partAfectados}`);
  console.log('');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
