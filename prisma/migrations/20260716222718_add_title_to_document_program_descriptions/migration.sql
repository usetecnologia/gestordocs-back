/*
  Warnings:

  - Added the required column `title` to the `document_program_descriptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `document_program_descriptions` ADD COLUMN `title` VARCHAR(200) NOT NULL DEFAULT '(sin título)';
ALTER TABLE `document_program_descriptions` ALTER COLUMN `title` DROP DEFAULT;
