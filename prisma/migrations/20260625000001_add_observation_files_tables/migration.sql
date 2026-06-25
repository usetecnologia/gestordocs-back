-- Tabla de archivos adjuntos a observaciones de usuario
CREATE TABLE `UserObservationFiles` (
    `id` VARCHAR(36) NOT NULL,
    `userObservationId` VARCHAR(191) NOT NULL,
    `file` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserObservationFiles_userObservationId_fkey`(`userObservationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tabla de archivos adjuntos a observaciones de documentos de usuario
CREATE TABLE `UserDocumentObservationFiles` (
    `id` VARCHAR(36) NOT NULL,
    `userDocumentHistoryId` VARCHAR(191) NOT NULL,
    `file` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserDocumentObservationFiles_userDocumentHistoryId_fkey`(`userDocumentHistoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `UserObservationFiles` ADD CONSTRAINT `UserObservationFiles_userObservationId_fkey`
    FOREIGN KEY (`userObservationId`) REFERENCES `UserObservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `UserDocumentObservationFiles` ADD CONSTRAINT `UserDocumentObservationFiles_userDocumentHistoryId_fkey`
    FOREIGN KEY (`userDocumentHistoryId`) REFERENCES `UserDocumentHistory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
