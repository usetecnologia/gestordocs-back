-- M4 (primera mitad): `UserDocuments.proceso_id`, columna nueva + backfill.
--
-- Aditiva y reversible: ADD COLUMN, un UPDATE que solo escribe la columna nueva, un indice y una
-- FK. No hay DELETE, DROP ni TRUNCATE, y ninguna columna existente se toca.
--
-- La columna queda NULLABLE a proposito. El plan pide terminar en NOT NULL, y las 25588 filas de
-- hoy quedan todas con proceso — pero el NOT NULL rompe el alta de participantes nuevos: el sync
-- les arma el expediente en el mismo momento en que se los crea, y todavia no existe
-- `EnsureProcesoInicial` (paso 5) que les de un proceso antes. El NOT NULL va con ese paso, junto
-- con un segundo backfill de las filas que se hayan creado en el medio.
--
-- A que proceso se cuelga cada fila: el proceso abierto del participante y, si no hubiera ninguno,
-- el mas reciente. Es la misma regla de "proceso visible" del paso 7, escrita una sola vez para
-- que la base y el codigo no puedan discrepar. `activo IS NULL` ordena los abiertos primero
-- (activo = 1 da 0, finalizado da 1) y `fecha_ingreso DESC` desempata.
--
-- Se usa una subconsulta correlacionada y no un JOIN: si un participante tuviera mas de un proceso,
-- un UPDATE con JOIN elegiria uno cualquiera sin avisar. Verificado antes de aplicar con
-- `prisma/inspect-backfill-user-documents-proceso.ts`: 0 usuarios con mas de un proceso, 0 filas
-- de `UserDocuments` sin proceso para su `userId`, y las 25588 pertenecen a participantes.
--
-- La FK es RESTRICT como las de `procesos`: un proceso con expediente colgando no se puede borrar,
-- y un ON DELETE SET NULL le vaciaria la columna por la espalda.


-- AlterTable
ALTER TABLE `UserDocuments` ADD COLUMN `proceso_id` VARCHAR(36) NULL;

-- Backfill
UPDATE `UserDocuments` ud
   SET ud.`proceso_id` = (
       SELECT p.`id`
         FROM `procesos` p
        WHERE p.`participante_id` = ud.`userId`
        ORDER BY p.`activo` IS NULL, p.`fecha_ingreso` DESC
        LIMIT 1
   )
 WHERE ud.`proceso_id` IS NULL;

-- CreateIndex
CREATE INDEX `idx_user_documents_proceso` ON `UserDocuments`(`proceso_id`);

-- AddForeignKey
ALTER TABLE `UserDocuments` ADD CONSTRAINT `UserDocuments_proceso_id_fkey` FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
