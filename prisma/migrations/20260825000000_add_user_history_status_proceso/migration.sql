-- `UserHistoryStatus.proceso_id`: el cambio de estado pertenece al ciclo en el que ocurrio.
--
-- Cierra el ultimo dato que seguia siendo del participante y no del ciclo. Un ciclo nuevo nacia en
-- SIN_DOCUMENTOS pero su linea de tiempo mostraba todos los estados de los ciclos anteriores. Ahora
-- nace limpia. Nada se borra: los estados del ciclo viejo siguen colgados de su proceso.
--
-- Aditiva: ADD COLUMN, un UPDATE que solo escribe la columna nueva, un indice y una FK RESTRICT. Sin
-- DELETE, DROP ni TRUNCATE.
--
-- El backfill asigna cada entrada al proceso que estaba vigente cuando se registro: el de
-- `fecha_ingreso` mas reciente que no sea posterior a `created_at`.
--
-- A diferencia de las observaciones y los correos, aca **no hay fallback al proceso mas antiguo**:
-- las entradas anteriores al primer proceso quedan en NULL a proposito. Son las que se crean en el
-- alta del participante, antes de que exista su proceso — el sync lo abre despues, en la misma
-- llamada. Esas entradas las adopta el propio `crearProcesoAbierto` cuando abre el primer ciclo, y
-- este UPDATE hace lo mismo para las que ya estan en base: la segunda parte, con el COALESCE al
-- proceso mas antiguo, cubre exactamente ese caso historico.


-- AlterTable
ALTER TABLE `UserHistoryStatus` ADD COLUMN `proceso_id` VARCHAR(36) NULL;

-- Backfill: el proceso vigente al momento del cambio de estado
UPDATE `UserHistoryStatus` h
   SET h.`proceso_id` = COALESCE(
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = h.`userId`
              AND p.`fecha_ingreso` <= h.`created_at`
            ORDER BY p.`fecha_ingreso` DESC
            LIMIT 1
       ),
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = h.`userId`
            ORDER BY p.`fecha_ingreso` ASC
            LIMIT 1
       )
   )
 WHERE h.`proceso_id` IS NULL;

-- CreateIndex
CREATE INDEX `idx_user_history_proceso` ON `UserHistoryStatus`(`proceso_id`);

-- AddForeignKey
ALTER TABLE `UserHistoryStatus` ADD CONSTRAINT `UserHistoryStatus_proceso_id_fkey` FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
