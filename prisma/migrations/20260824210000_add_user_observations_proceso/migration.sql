-- `UserObservations.proceso_id`: la observacion pertenece al ciclo en el que se levanto.
--
-- El porque: la regla 0 de `TerminarRevision` manda a OBSERVADO a cualquier participante con una
-- observacion abierta, sin mirar sus documentos. Con la observacion colgada del participante y no
-- del ciclo, una que quedo abierta en el ciclo anterior arrastraba al ciclo nuevo a OBSERVADO el
-- mismo dia en que nacia en SIN_DOCUMENTOS. Acotando la regla al ciclo visible, el ciclo nuevo
-- arranca limpio y la observacion sigue existiendo donde se levanto.
--
-- Aditiva: ADD COLUMN, un UPDATE que solo escribe la columna nueva, un indice y una FK RESTRICT. Sin
-- DELETE, DROP ni TRUNCATE. Ninguna observacion se cierra ni se modifica — cerrarlas para "limpiar"
-- el ciclo habria destruido informacion que alguien escribio a mano.
--
-- El backfill asigna cada observacion al proceso que estaba vigente cuando se creo: el de
-- `fecha_ingreso` mas reciente que no sea posterior a `created_at`. Si ninguno califica —una
-- observacion anterior al primer proceso— cae al proceso mas antiguo del participante, que es el
-- ciclo al que pertenecia de hecho. Verificado contra testdocs: 26 observaciones, todas resuelven.
--
-- Queda NULLABLE: el staff no tiene procesos, y una observacion sin ciclo no es un dato faltante.


-- AlterTable
ALTER TABLE `UserObservations` ADD COLUMN `proceso_id` VARCHAR(36) NULL;

-- Backfill: el proceso vigente al momento de la observacion
UPDATE `UserObservations` o
   SET o.`proceso_id` = COALESCE(
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = o.`userId`
              AND p.`fecha_ingreso` <= o.`created_at`
            ORDER BY p.`fecha_ingreso` DESC
            LIMIT 1
       ),
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = o.`userId`
            ORDER BY p.`fecha_ingreso` ASC
            LIMIT 1
       )
   )
 WHERE o.`proceso_id` IS NULL;

-- CreateIndex
CREATE INDEX `idx_user_observations_proceso` ON `UserObservations`(`proceso_id`);

-- AddForeignKey
ALTER TABLE `UserObservations` ADD CONSTRAINT `UserObservations_proceso_id_fkey` FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
