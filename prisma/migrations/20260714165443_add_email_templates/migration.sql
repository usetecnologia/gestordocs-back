-- CreateTable
CREATE TABLE `acciones_correo` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `acciones_correo_code_key`(`code`),
    INDEX `idx_email_actions_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plantillas_correo` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `subject` VARCHAR(150) NOT NULL,
    `html_content` TEXT NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `type` ENUM('NORMAL', 'PROGRAMADA') NOT NULL,
    `action_id` VARCHAR(36) NOT NULL,
    `schedule` JSON NULL,
    `created_by_id` VARCHAR(36) NULL,
    `updated_by_id` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plantillas_correo_code_key`(`code`),
    INDEX `idx_email_templates_action`(`action_id`),
    INDEX `idx_email_templates_status`(`status`),
    INDEX `idx_email_templates_type`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plantillas_correo` ADD CONSTRAINT `plantillas_correo_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `acciones_correo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plantillas_correo` ADD CONSTRAINT `plantillas_correo_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plantillas_correo` ADD CONSTRAINT `plantillas_correo_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
