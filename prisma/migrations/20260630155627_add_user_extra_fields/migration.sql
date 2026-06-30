-- AlterTable
ALTER TABLE `User` ADD COLUMN `employer` VARCHAR(191) NULL,
    ADD COLUMN `fechaDSinUSE` VARCHAR(191) NULL,
    ADD COLUMN `fechadeenvioalsponsor` VARCHAR(191) NULL,
    ADD COLUMN `hired_date` VARCHAR(191) NULL,
    ADD COLUMN `jo_use_date` VARCHAR(191) NULL,
    ADD COLUMN `programAgreementOK` BOOLEAN NULL,
    ADD COLUMN `statusExternal` VARCHAR(191) NULL,
    ADD COLUMN `statusSolRetiro` VARCHAR(191) NULL,
    ADD COLUMN `status_hired` INTEGER NULL;
