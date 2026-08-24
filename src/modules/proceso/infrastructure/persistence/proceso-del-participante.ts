import { Prisma } from 'prisma/generated/prisma/client';

/** Cliente de Prisma o transacción: el helper sirve dentro y fuera de una. */
type ClientePrisma = Prisma.TransactionClient;

/**
 * Proceso visible del participante, para colgarle un registro que pertenece al ciclo en curso:
 * una entrada de historial de estado, un correo, una observación.
 *
 * Existe porque hay ocho lugares que escriben `UserHistoryStatus` y ninguno tiene por qué saber
 * cómo se resuelve un proceso. La regla vive acá y no repetida en cada uno.
 *
 * Devuelve `null` cuando el participante todavía no tiene proceso — el caso del alta, donde la
 * primera entrada de historial se escribe antes de que el sync le abra el ciclo. Esas entradas
 * huérfanas las adopta `crearProcesoAbierto` al abrir el primer proceso, así que no se pierden de
 * vista.
 */
export async function procesoVisibleDe(
  tx: ClientePrisma,
  userId: string,
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { procesoVisibleId: true },
  });
  return user?.procesoVisibleId ?? null;
}
