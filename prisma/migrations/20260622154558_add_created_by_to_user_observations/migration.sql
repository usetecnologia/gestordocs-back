-- AlterTable
ALTER TABLE `UserObservations` ADD COLUMN `created_by_id` VARCHAR(36) NULL;

-- AddForeignKey
ALTER TABLE `UserObservations` ADD CONSTRAINT `UserObservations_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
