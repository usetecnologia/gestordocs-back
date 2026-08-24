import { $Enums, Prisma } from 'prisma/generated/prisma/client';

/**
 * Copia el estado documental del participante al proceso que tiene **abierto**.
 *
 * `proceso.statusDocumental` es la fuente de verdad histórica —el estado con el que cerró cada
 * ciclo— y `User.status` es su espejo del proceso activo. El espejo existe para no reescribir el
 * embudo del dashboard, los exports ni `email-audience`, que leen `User.status`: siguen leyendo lo
 * mismo, y el proceso queda con el registro que sobrevive al cierre del ciclo.
 *
 * Es una función que recibe la transacción, no un método de repositorio, porque los tres lugares que
 * escriben `User.status` ya lo hacen dentro de una —junto con su fila de `UserHistoryStatus`— y el
 * espejo tiene que entrar en la misma: si quedara afuera, un fallo intermedio dejaría los dos
 * valores en desacuerdo, que es justo lo que este mecanismo evita. Se decidió sin triggers de base
 * de datos (decisión §2.5 del documento de estado).
 *
 * **Un proceso finalizado nunca se toca**: el filtro `activo: true` no lo alcanza. No hace falta
 * preguntar por el estado antes — la propia consulta congela el ciclo cerrado. Si el participante
 * no tiene proceso abierto, actualiza 0 filas y no es un error.
 */
export async function espejarStatusDocumental(
  tx: Prisma.TransactionClient,
  participanteId: string,
  status: string,
): Promise<void> {
  await tx.proceso.updateMany({
    where: { participanteId, activo: true },
    data: { statusDocumental: status as $Enums.UserStatus },
  });
}
