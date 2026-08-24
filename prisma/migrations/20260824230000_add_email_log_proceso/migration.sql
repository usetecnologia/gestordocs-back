-- `historial_correos.proceso_id`: el correo pertenece al ciclo en el que se envio.
--
-- El porque: el historial de correos se leia por participante, asi que un ciclo nuevo nacia
-- mostrando los correos del anterior. Un ciclo nuevo arranca sin historial. Los correos del ciclo
-- viejo no se borran ni se editan: siguen colgados de su ciclo, que es donde ocurrieron.
--
-- Aditiva: ADD COLUMN, un UPDATE que solo escribe la columna nueva, un indice y una FK RESTRICT. Sin
-- DELETE, DROP ni TRUNCATE.
--
-- El backfill asigna cada correo al proceso que estaba vigente cuando se envio: el de
-- `fecha_ingreso` mas reciente que no sea posterior a `sent_at`. Si ninguno califica —un correo
-- anterior al primer proceso— cae al proceso mas antiguo del participante. Verificado contra
-- testdocs: 27 registros, los 27 con destinatario y los 27 resuelven por fecha.
--
-- Queda NULLABLE por dos razones: hay registros a nivel de plantilla (un OMITIDO cuando la
-- plantilla no tiene audiencia) que no tienen `recipient_user_id` y por lo tanto no tienen ciclo, y
-- el destinatario podria no ser un participante.


-- AlterTable
ALTER TABLE `historial_correos` ADD COLUMN `proceso_id` VARCHAR(36) NULL;

-- Backfill: el proceso vigente al momento del envio
UPDATE `historial_correos` h
   SET h.`proceso_id` = COALESCE(
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = h.`recipient_user_id`
              AND p.`fecha_ingreso` <= h.`sent_at`
            ORDER BY p.`fecha_ingreso` DESC
            LIMIT 1
       ),
       (
           SELECT p.`id` FROM `procesos` p
            WHERE p.`participante_id` = h.`recipient_user_id`
            ORDER BY p.`fecha_ingreso` ASC
            LIMIT 1
       )
   )
 WHERE h.`recipient_user_id` IS NOT NULL
   AND h.`proceso_id` IS NULL;

-- CreateIndex
CREATE INDEX `idx_email_log_proceso` ON `historial_correos`(`proceso_id`);

-- AddForeignKey
ALTER TABLE `historial_correos` ADD CONSTRAINT `historial_correos_proceso_id_fkey` FOREIGN KEY (`proceso_id`) REFERENCES `procesos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
