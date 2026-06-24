-- DropForeignKey
ALTER TABLE `OptionProgram` DROP FOREIGN KEY `OptionProgram_sponsorId_fkey`;

-- DropIndex
DROP INDEX `OptionProgram_sponsorId_fkey` ON `OptionProgram`;

-- AlterTable
ALTER TABLE `OptionProgram` MODIFY `sponsorId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `OptionProgram` ADD CONSTRAINT `OptionProgram_sponsorId_fkey` FOREIGN KEY (`sponsorId`) REFERENCES `Sponsor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
