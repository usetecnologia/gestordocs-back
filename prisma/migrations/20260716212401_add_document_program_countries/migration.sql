-- CreateTable
CREATE TABLE `document_programs` (
    `id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NOT NULL,
    `program_id` VARCHAR(36) NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_document_programs_document`(`document_id`),
    INDEX `idx_document_programs_program`(`program_id`),
    UNIQUE INDEX `uq_document_program`(`document_id`, `program_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_program_descriptions` (
    `id` VARCHAR(36) NOT NULL,
    `document_program_id` VARCHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_document_program_descriptions_document_program`(`document_program_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_program_description_countries` (
    `id` VARCHAR(36) NOT NULL,
    `document_program_description_id` VARCHAR(36) NOT NULL,
    `document_program_id` VARCHAR(36) NOT NULL,
    `country_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_dpd_countries_description`(`document_program_description_id`),
    INDEX `idx_dpd_countries_country`(`country_id`),
    UNIQUE INDEX `uq_document_program_country`(`document_program_id`, `country_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `document_programs` ADD CONSTRAINT `document_programs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_programs` ADD CONSTRAINT `document_programs_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_program_descriptions` ADD CONSTRAINT `document_program_descriptions_document_program_id_fkey` FOREIGN KEY (`document_program_id`) REFERENCES `document_programs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_program_description_countries` ADD CONSTRAINT `document_program_description_countries_document_program_des_fkey` FOREIGN KEY (`document_program_description_id`) REFERENCES `document_program_descriptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_program_description_countries` ADD CONSTRAINT `document_program_description_countries_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `Country`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
