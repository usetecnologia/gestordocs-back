import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from './generated/prisma/client';

/**
 * Inventario previo (SOLO LECTURA) al filtrado de documentos por programa.
 *
 * Con el filtro nuevo un documento se le pide a un participante solo si está asociado
 * explícitamente a su programa. Este script responde, sin escribir nada:
 *
 *   1. Cuántos documentos tienen programas asociados y cuántos no.
 *   2. Cuántos participantes perderían documentos de su expediente y cuántos registros.
 *   3. Cuántos participantes no tienen programa asignado (para ellos el sync se omite).
 *
 * No modifica ninguna fila. Ejecutar: npm run inspect:document-programs
 */

const adapter = new PrismaMariaDb({
  host: process.env.HOST_DB!,
  user: process.env.USER_DB!,
  password: process.env.PASSWORD_DB!,
  database: process.env.DATABASE_DB!,
  port: Number(process.env.PORT_DB ?? 3306),
});
const prisma = new PrismaClient({ adapter });

function pct(part: number, total: number): string {
  if (total === 0) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  console.log(`\nBase de datos: ${process.env.DATABASE_DB} @ ${process.env.HOST_DB}\n`);

  // ── 1. Documentos y sus programas ──────────────────────────────────────────
  const documents = await prisma.documents.findMany({
    select: {
      id: true,
      name: true,
      siglasCode: true,
      status: true,
      documentPrograms: {
        select: { programId: true, status: true },
      },
      documentSponsors: {
        select: { id: true, status: true },
      },
    },
  });

  // documentId -> programas activos a los que está asociado
  const activeProgramsByDoc = new Map<string, Set<string>>();
  // documentSponsorId -> documentId padre (el apuntador doble de UserDocuments)
  const docIdBySponsorLink = new Map<string, string>();

  for (const doc of documents) {
    activeProgramsByDoc.set(
      doc.id,
      new Set(doc.documentPrograms.filter((dp) => dp.status).map((dp) => dp.programId)),
    );
    for (const link of doc.documentSponsors) docIdBySponsorLink.set(link.id, doc.id);
  }

  const activos = documents.filter((d) => d.status);
  const sinPrograma = documents.filter((d) => activeProgramsByDoc.get(d.id)!.size === 0);
  const sinProgramaActivos = sinPrograma.filter((d) => d.status);

  console.log('═══ 1. DOCUMENTOS ═══');
  console.log(`Total en catálogo:            ${documents.length}  (activos: ${activos.length})`);
  console.log(
    `Con programas asociados:      ${documents.length - sinPrograma.length}  ` +
      `(${pct(documents.length - sinPrograma.length, documents.length)})`,
  );
  console.log(
    `SIN programas asociados:      ${sinPrograma.length}  ` +
      `(${pct(sinPrograma.length, documents.length)})  ← dejarían de pedirse`,
  );
  console.log(`   de esos, activos:          ${sinProgramaActivos.length}`);

  // Distribución de documentos por programa
  const docsPorPrograma = new Map<string, number>();
  for (const [, programIds] of activeProgramsByDoc) {
    for (const programId of programIds) {
      docsPorPrograma.set(programId, (docsPorPrograma.get(programId) ?? 0) + 1);
    }
  }
  const programas = await prisma.program.findMany({
    select: { id: true, name: true, code: true, status: true },
  });

  console.log('\n═══ 2. DOCUMENTOS POR PROGRAMA ═══');
  for (const p of programas) {
    const n = docsPorPrograma.get(p.id) ?? 0
    const flag = n === 0 ? '  ← ningún documento configurado' : '';
    console.log(`${(p.code ?? '—').padEnd(14)} ${String(n).padStart(4)} documentos  ${p.name}${p.status ? '' : ' (inactivo)'}${flag}`);
  }

  if (sinProgramaActivos.length > 0) {
    console.log('\n═══ 3. DOCUMENTOS ACTIVOS SIN PROGRAMA (a configurar) ═══');
    for (const d of sinProgramaActivos) {
      const generales = d.documentSponsors.filter((s) => s.status).length === 0;
      console.log(
        `${(d.siglasCode ?? '—').padEnd(16)} ${generales ? '[general]      ' : '[por sponsor]  '} ${d.name}`,
      );
    }
  }

  // ── 4. Participantes afectados ─────────────────────────────────────────────
  const userDocs = await prisma.userDocuments.findMany({
    where: { statusDocument: true },
    select: { id: true, userId: true, documentId: true, documentSponsorId: true },
  });

  const userIds = [...new Set(userDocs.map((ud) => ud.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, programId: true, status: true },
  });
  const programByUser = new Map(users.map((u) => [u.id, u.programId]));

  let registrosQueSePierden = 0;
  const usuariosAfectados = new Set<string>();
  const usuariosSinPrograma = new Set<string>();
  const usuariosQueQuedanEnCero = new Set<string>();
  const totalPorUsuario = new Map<string, number>();
  const perdidosPorUsuario = new Map<string, number>();

  for (const ud of userDocs) {
    totalPorUsuario.set(ud.userId, (totalPorUsuario.get(ud.userId) ?? 0) + 1);

    const programId = programByUser.get(ud.userId) ?? null;
    if (!programId) {
      usuariosSinPrograma.add(ud.userId);
      continue; // el sync se omite: su expediente queda intacto
    }

    const docId = ud.documentId ?? (ud.documentSponsorId ? docIdBySponsorLink.get(ud.documentSponsorId) : undefined);
    if (!docId) continue; // registro huérfano, no lo toca este cambio

    if (!activeProgramsByDoc.get(docId)?.has(programId)) {
      registrosQueSePierden++;
      usuariosAfectados.add(ud.userId);
      perdidosPorUsuario.set(ud.userId, (perdidosPorUsuario.get(ud.userId) ?? 0) + 1);
    }
  }

  for (const [userId, perdidos] of perdidosPorUsuario) {
    if (perdidos === (totalPorUsuario.get(userId) ?? 0)) usuariosQueQuedanEnCero.add(userId);
  }

  const totalParticipantes = await prisma.user.count();

  console.log('\n═══ 4. PARTICIPANTES AFECTADOS ═══');
  console.log(`Participantes en base:                    ${totalParticipantes}`);
  console.log(`Con documentos activos:                   ${userIds.length}`);
  console.log(`Registros de documento activos:           ${userDocs.length}`);
  console.log('');
  console.log(`Participantes que PERDERÍAN documentos:   ${usuariosAfectados.size}  (${pct(usuariosAfectados.size, userIds.length)} de los que tienen documentos)`);
  console.log(`Registros que se desactivarían:           ${registrosQueSePierden}  (${pct(registrosQueSePierden, userDocs.length)})`);
  console.log(`Participantes que quedarían en CERO:      ${usuariosQueQuedanEnCero.size}`);
  console.log('');
  console.log(`Participantes SIN programa asignado:      ${usuariosSinPrograma.size}  ← el sync se omite, expediente intacto`);

  if (usuariosAfectados.size > 0) {
    const top = [...perdidosPorUsuario.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.log('\nTop 10 participantes por documentos perdidos (userId — perdidos/total):');
    for (const [userId, perdidos] of top) {
      console.log(`  ${userId}  ${perdidos}/${totalPorUsuario.get(userId)}`);
    }
  }

  console.log('\n(Consulta de solo lectura — no se modificó ninguna fila.)\n');
}

main()
  .catch((error: unknown) => {
    console.error('Error al ejecutar el inventario:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
