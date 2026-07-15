-- CreateTable
CREATE TABLE `historial_correos` (
    `id` VARCHAR(36) NOT NULL,
    `action_id` VARCHAR(36) NULL,
    `action_code` VARCHAR(50) NOT NULL,
    `template_id` VARCHAR(36) NULL,
    `template_code` VARCHAR(50) NULL,
    `recipient_user_id` VARCHAR(36) NULL,
    `recipient_email` VARCHAR(150) NULL,
    `subject` VARCHAR(200) NULL,
    `status` ENUM('ENVIADO', 'FALLIDO', 'OMITIDO') NOT NULL,
    `source` ENUM('NORMAL', 'PROGRAMADA') NOT NULL,
    `error_message` TEXT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_email_log_recipient`(`recipient_user_id`),
    INDEX `idx_email_log_action`(`action_id`),
    INDEX `idx_email_log_template`(`template_id`),
    INDEX `idx_email_log_status`(`status`),
    INDEX `idx_email_log_sent_at`(`sent_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `historial_correos` ADD CONSTRAINT `historial_correos_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `acciones_correo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_correos` ADD CONSTRAINT `historial_correos_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `plantillas_correo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `historial_correos` ADD CONSTRAINT `historial_correos_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
