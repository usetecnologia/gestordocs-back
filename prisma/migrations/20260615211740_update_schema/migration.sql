-- AlterTable
ALTER TABLE `UserDocuments` ADD COLUMN `statusDocument` BOOLEAN NULL;

-- AddForeignKey
ALTER TABLE `UserDocumentHistory` ADD CONSTRAINT `UserDocumentHistory_userDocumentsId_fkey` FOREIGN KEY (`userDocumentsId`) REFERENCES `UserDocuments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
