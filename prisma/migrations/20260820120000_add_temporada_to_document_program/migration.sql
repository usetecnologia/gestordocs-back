-- AlterTable
-- VARCHAR(191) y no VARCHAR(36) como el resto de las columnas de este modulo:
-- debe coincidir exactamente con Temporada.id o MariaDB rechaza la clave foranea.
ALTER TABLE `document_programs` ADD COLUMN `temporada_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `idx_document_programs_temporada` ON `document_programs`(`temporada_id`);

-- AddForeignKey
-- ON DELETE RESTRICT: borrar una temporada en uso debe fallar. El mensaje legible lo
-- da DeleteTemporadaUseCase; esta restriccion es la red de seguridad para borrados
-- que no pasen por la aplicacion (SQL directo, Prisma Studio).
ALTER TABLE `document_programs` ADD CONSTRAINT `document_programs_temporada_id_fkey`
  FOREIGN KEY (`temporada_id`) REFERENCES `Temporada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
