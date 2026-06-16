/*
  Warnings:

  - You are about to drop the column `etiquetaId` on the `UserDocumentHistory` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `UserDocumentHistory` DROP FOREIGN KEY `UserDocumentHistory_etiquetaId_fkey`;

-- DropIndex
DROP INDEX `UserDocumentHistory_etiquetaId_fkey` ON `UserDocumentHistory`;

-- AlterTable
ALTER TABLE `UserDocumentHistory` DROP COLUMN `etiquetaId`;

-- CreateTable
CREATE TABLE `UserDocumentHistoryEtiquetas` (
    `id` VARCHAR(36) NOT NULL,
    `userDocumentHistoryId` VARCHAR(36) NOT NULL,
    `etiquetaId` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserDocumentHistoryEtiquetas` ADD CONSTRAINT `UserDocumentHistoryEtiquetas_userDocumentHistoryId_fkey` FOREIGN KEY (`userDocumentHistoryId`) REFERENCES `UserDocumentHistory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDocumentHistoryEtiquetas` ADD CONSTRAINT `UserDocumentHistoryEtiquetas_etiquetaId_fkey` FOREIGN KEY (`etiquetaId`) REFERENCES `Etiquetas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
