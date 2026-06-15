/*
  Warnings:

  - You are about to drop the column `statusDocument` on the `UserDocuments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `UserDocuments` DROP COLUMN `statusDocument`,
    ADD COLUMN `status_document` BOOLEAN NOT NULL DEFAULT true;
