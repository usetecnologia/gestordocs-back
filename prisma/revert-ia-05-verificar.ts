import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * FASE 4 — Verificación posterior a la reversión (SOLO LECTURA).
 *
 * Contrasta el estado real de la base contra lo que el log dice que se hizo. No se fía del log:
 * vuelve a leer cada documento y cada participante.
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

interface Detalle {
  dni: string;
  nombre: string;
  userId: string;
  userDocumentId: string;
  documentoA: string;
  participanteA: string;
  historialBorrado: { id: string };
}

async function main() {
  const log = JSON.parse(
    readFileSync('reversion-ia/revert-ia-04-aplicado.json', 'utf8'),
  ) as {
    revertidos: number;
    terminarRevision: { dni: string; de: string; a: string }[];
    detalle: Detalle[];
  };

  console.log('=== 1. ¿Quedan observaciones de la corrida? ===');
  const [restantes] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND h.created_by_id = ${AUTOR_CORRIDA}
      AND h.created_at BETWEEN '2026-08-04 17:49:00' AND '2026-08-04 21:47:00'
  `;
  console.log(`   Quedan ${Number(restantes.total)} (esperado: 15, los excluidos)\n`);

  console.log('=== 2. ¿Se borraron los historiales de las 230? ===');
  const idsBorrados = log.detalle.map((d) => d.historialBorrado.id);
  const sobrevivientes = await prisma.userDocumentHistory.count({
    where: { id: { in: idsBorrados } },
  });
  console.log(`   Historiales que deberían estar borrados y siguen existiendo: ${sobrevivientes} (esperado 0)\n`);

  console.log('=== 3. ¿Los documentos quedaron en el estado correcto? ===');
  const docs = await prisma.userDocuments.findMany({
    where: { id: { in: log.detalle.map((d) => d.userDocumentId) } },
    select: { id: true, status: true },
  });
  const statusPorDoc = new Map(docs.map((d) => [d.id, String(d.status)]));
  const docsMal = log.detalle.filter((d) => statusPorDoc.get(d.userDocumentId) !== d.documentoA);
  console.log(`   Documentos verificados: ${docs.length}`);
  console.log(`   Con estado distinto al esperado: ${docsMal.length}`);
  docsMal.slice(0, 10).forEach((d) =>
    console.log(`      DNI ${d.dni}: esperado ${d.documentoA}, real ${statusPorDoc.get(d.userDocumentId)}`),
  );
  const aunObservados = docs.filter((d) => String(d.status) === 'OBSERVADO').length;
  console.log(`   Documentos que siguen en OBSERVADO: ${aunObservados} (esperado 2, los que ya lo estaban antes)\n`);

  console.log('=== 4. ¿Los participantes quedaron en el estado correcto? ===');
  const users = await prisma.user.findMany({
    where: { id: { in: log.detalle.map((d) => d.userId) } },
    select: { id: true, status: true },
  });
  const statusPorUser = new Map(users.map((u) => [u.id, String(u.status)]));
  const esperadoTerminar = new Map(log.terminarRevision.map((t) => [t.dni, t.a]));

  let okDirectos = 0;
  let okTerminados = 0;
  const usuariosMal: string[] = [];

  for (const d of log.detalle) {
    const real = statusPorUser.get(d.userId);
    if (d.participanteA === '(pendiente de TerminarRevision)') {
      const esperado = esperadoTerminar.get(d.dni);
      if (real === esperado) okTerminados++;
      else usuariosMal.push(`DNI ${d.dni}: TerminarRevision dejó ${esperado}, ahora está ${real}`);
    } else if (real === d.participanteA) {
      okDirectos++;
    } else {
      usuariosMal.push(`DNI ${d.dni}: esperado ${d.participanteA}, real ${real}`);
    }
  }
  console.log(`   Estado restaurado correctamente:        ${okDirectos}`);
  console.log(`   Recalculado por TerminarRevision:       ${okTerminados}`);
  console.log(`   Con diferencias:                        ${usuariosMal.length}`);
  usuariosMal.slice(0, 15).forEach((m) => console.log(`      ${m}`));

  console.log('\n=== 5. Los 15 excluidos siguen intactos ===');
  const excluidos = await prisma.$queryRaw<
    { dni: string | null; docStatus: string; userStatus: string }[]
  >`
    SELECT p.dni, ud.status AS docStatus, u.status AS userStatus
    FROM UserDocumentHistoryEtiquetas e
    JOIN UserDocumentHistory h ON h.id = e.userDocumentHistoryId
    JOIN UserDocuments ud      ON ud.id = h.userDocumentsId
    LEFT JOIN Person p         ON p.id = ud.userId
    LEFT JOIN User u           ON u.id = ud.userId
    WHERE e.etiquetaId = ${ETIQUETA_IA}
      AND h.created_by_id = ${AUTOR_CORRIDA}
      AND h.created_at BETWEEN '2026-08-04 17:49:00' AND '2026-08-04 21:47:00'
    ORDER BY p.dni
  `;
  console.table(excluidos.map((e) => ({ dni: e.dni, documento: e.docStatus, participante: e.userStatus })));

  console.log('\n=== 6. Distribución final de los 230 revertidos ===');
  const porEstadoDoc = new Map<string, number>();
  for (const d of docs) {
    const k = String(d.status);
    porEstadoDoc.set(k, (porEstadoDoc.get(k) ?? 0) + 1);
  }
  console.table([...porEstadoDoc.entries()].map(([estado, cantidad]) => ({ documento: estado, cantidad })));

  const porEstadoUser = new Map<string, number>();
  for (const u of users) {
    const k = String(u.status);
    porEstadoUser.set(k, (porEstadoUser.get(k) ?? 0) + 1);
  }
  console.table([...porEstadoUser.entries()].map(([estado, cantidad]) => ({ participante: estado, cantidad })));

  const problemas = sobrevivientes + docsMal.length + usuariosMal.length;
  console.log(
    problemas === 0
      ? '\n✅ VERIFICACIÓN CORRECTA: no se encontró ninguna diferencia.'
      : `\n⚠️ Se encontraron ${problemas} diferencias — revisar arriba.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
