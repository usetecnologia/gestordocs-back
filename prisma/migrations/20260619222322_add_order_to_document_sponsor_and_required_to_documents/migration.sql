-- AlterTable
ALTER TABLE `document_sponsors` ADD COLUMN `order` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `documents` ADD COLUMN `required` BOOLEAN NOT NULL DEFAULT false;
