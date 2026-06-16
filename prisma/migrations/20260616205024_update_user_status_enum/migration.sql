-- CreateTable
CREATE TABLE `UserObservations` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `observation` TEXT NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserObservationEtiquetas` (
    `id` VARCHAR(36) NOT NULL,
    `userObservationId` VARCHAR(191) NOT NULL,
    `etiquetaId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserHistoryStatus` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('SIN_DOCUMENTOS', 'DOCUMENTOS_INCOMPLETOS', 'PENDIENTE_REVISAR', 'EN_REVISION', 'OBSERVADO', 'RETENIDO_USE', 'PREPARACION', 'ENVIADO_SPONSOR', 'OBSERVADO_SPONSOR', 'RECHAZADO_SPONSOR', 'APROBADO_SPONSOR', 'DS2019_EMITIDO', 'RETIRADO', 'ACTIVO') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserObservations` ADD CONSTRAINT `UserObservations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserObservationEtiquetas` ADD CONSTRAINT `UserObservationEtiquetas_userObservationId_fkey` FOREIGN KEY (`userObservationId`) REFERENCES `UserObservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserObservationEtiquetas` ADD CONSTRAINT `UserObservationEtiquetas_etiquetaId_fkey` FOREIGN KEY (`etiquetaId`) REFERENCES `Etiquetas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserHistoryStatus` ADD CONSTRAINT `UserHistoryStatus_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
