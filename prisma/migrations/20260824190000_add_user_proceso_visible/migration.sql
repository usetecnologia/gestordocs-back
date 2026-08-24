-- Paso 7: `User.proceso_visible_id`, el proceso que el participante ve.
--
-- Aditiva: ADD COLUMN, un UPDATE que solo escribe la columna nueva, un indice y una FK. Sin DELETE,
-- DROP ni TRUNCATE, y ninguna columna existente se toca.
--
-- Es un puntero desnormalizado a proposito. La regla —el proceso abierto y, si no hay ninguno, el
-- mas reciente— se puede calcular, pero los listados, los dos exports y el embudo del dashboard la
-- necesitan para miles de participantes a la vez: guardarla evita una subconsulta por fila. Quien la
-- mantiene es el repositorio de proceso, en los tres momentos en que puede cambiar (abrir,
-- finalizar, reabrir).
--
-- Queda NULLABLE, al contrario que `UserDocuments.proceso_id`: el staff de USE no tiene procesos, y
-- un participante al que no se le pudo abrir uno tampoco. Es la ausencia de un proceso, no un dato
-- faltante.
--
-- El ORDER BY es el mismo que usa el codigo: `activo IS NULL` pone el abierto primero (activo = 1
-- da 0, finalizado da 1) y `fecha_ingreso DESC` desempata entre finalizados. Escrito igual en los
-- dos lados para que la base y el codigo no puedan discrepar.


-- AlterTable
ALTER TABLE `User` ADD COLUMN `proceso_visible_id` VARCHAR(36) NULL;

-- Backfill
UPDATE `User` u
   SET u.`proceso_visible_id` = (
       SELECT p.`id`
         FROM `procesos` p
        WHERE p.`participante_id` = u.`id`
        ORDER BY p.`activo` IS NULL, p.`fecha_ingreso` DESC
        LIMIT 1
   )
 WHERE u.`proceso_visible_id` IS NULL;

-- CreateIndex
CREATE INDEX `idx_user_proceso_visible` ON `User`(`proceso_visible_id`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_proceso_visible_id_fkey` FOREIGN KEY (`proceso_visible_id`) REFERENCES `procesos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
