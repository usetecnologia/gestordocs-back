import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inspección SOLO LECTURA de los casos que la validación (revert-ia2-02) marcó como conflictivos de
 * verdad: participantes donde restaurar el estado previo NO es un no-op y hay una razón para que
 * deban seguir observados.
 *
 * La pregunta concreta en cada uno: ¿el motivo que los mantiene observados existía ANTES de la
 * corrida (y entonces su estado previo simplemente estaba desactualizado) o apareció DESPUÉS (y
 * entonces restaurar el estado previo borraría trabajo legítimo)?
 *
 * Uso: npx ts-node -r tsconfig-paths/register prisma/inspect-casos-conflictivos.ts [dni...]
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

const CORRIDA_INICIO = new Date('2026-08-08T01:21:40Z');
const DNIS = process.argv.slice(2).length ? process.argv.slice(2) : ['73969031', '70710164'];

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : '(null)');
const antesODespues = (d: Date | null | undefined) =>
  !d ? '(sin fecha)' : d.getTime() < CORRIDA_INICIO.getTime() ? 'ANTES de la corrida' : 'DESPUÉS de la corrida';

async function main() {
  console.log(`Base: ${process.env.HOST_DB}:${process.env.PORT_DB}/${process.env.DATABASE_DB}`);
  console.log(`Corrida: ${iso(CORRIDA_INICIO)}\nSOLO LECTURA.\n`);

  for (const dni of DNIS) {
    const persona = await prisma.person.findFirst({ where: { dni }, select: { id: true, firstname: true, lastfathername: true } });
    if (!persona) {
      console.log(`### DNI ${dni} — no encontrado\n`);
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { id: persona.id },
      select: { id: true, status: true, fechadeenvioalsponsor: true },
    });

    console.log('='.repeat(100));
    console.log(`### DNI ${dni} — ${persona.firstname} ${persona.lastfathername}`);
    console.log(`    estado actual: ${user?.status} | enviado al sponsor: ${user?.fechadeenvioalsponsor || '(no)'}`);

    // Observaciones de participante (UserObservations)
    const observaciones = await prisma.userObservations.findMany({
      where: { userId: persona.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, observation: true, status: true, endDate: true, createdAt: true, createdById: true },
    });
    if (observaciones.length) {
      console.log(`\n    --- UserObservations (${observaciones.length}) ---`);
      for (const o of observaciones) {
        console.log(
          `    ${o.status && !o.endDate ? '🔴 VIGENTE' : '   cerrada'} | creada ${iso(o.createdAt)} ` +
            `(${antesODespues(o.createdAt)}) | fin ${iso(o.endDate)} | por ${o.createdById ?? 'null'}`,
        );
        console.log(`        "${(o.observation ?? '').slice(0, 180)}"`);
      }
    } else {
      console.log('\n    --- Sin UserObservations ---');
    }

    // Todos sus documentos, con su último historial
    const docs = await prisma.userDocuments.findMany({
      where: { userId: persona.id },
      select: {
        id: true, status: true, statusDocument: true,
        documents: { select: { name: true, required: true, type: true } },
        documentSponsors: { select: { required: true, document: { select: { name: true, type: true } } } },
        userDocumentHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, status: true, createdAt: true, createdById: true, observation: true,
            userDocumentHistoryEtiquetas: { select: { etiquetaId: true } },
          },
        },
      },
    });

    console.log(`\n    --- Documentos (${docs.length}) ---`);
    for (const d of docs) {
      const nombre = d.documentSponsors?.document?.name ?? d.documents?.name ?? '(?)';
      const obligatorio = d.documentSponsors?.required ?? d.documents?.required ?? false;
      const tipo = d.documentSponsors?.document?.type ?? d.documents?.type ?? '?';
      const marca = d.status === 'OBSERVADO' ? '🔴' : '  ';
      console.log(`    ${marca} ${d.status.padEnd(14)} | ${nombre} | tipo=${tipo} obligatorio=${obligatorio} activo=${d.statusDocument}`);
      for (const h of d.userDocumentHistory) {
        const esIa = h.userDocumentHistoryEtiquetas.some((e) => e.etiquetaId === '6de02d0d-a5ef-40c7-8488-7cf604a16d43');
        console.log(
          `         ${esIa ? '🤖' : '  '} ${h.status.padEnd(14)} ${iso(h.createdAt)} (${antesODespues(h.createdAt)}) por ${h.createdById ?? 'null'}` +
            (h.observation ? `\n              "${h.observation.slice(0, 150)}"` : ''),
        );
      }
    }

    // Historial de estados alrededor de la corrida
    const estados = await prisma.userHistoryStatus.findMany({
      where: { userId: persona.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, createdAt: true, createdById: true },
    });
    console.log(`\n    --- UserHistoryStatus (últimos 12 de ${estados.length}) ---`);
    for (const e of estados.slice(-12)) {
      console.log(`       ${e.status.padEnd(24)} ${iso(e.createdAt)} (${antesODespues(e.createdAt)}) por ${e.createdById ?? 'null'}`);
    }
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
