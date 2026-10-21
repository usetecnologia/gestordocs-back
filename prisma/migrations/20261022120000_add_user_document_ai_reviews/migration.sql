-- Revisión automática con IA de los documentos que sube el participante.
--
-- Tabla nueva y vacía: no altera ninguna tabla existente. Guarda, por cada revisión, la decisión
-- de la IA (APROBADO, OBSERVADO, REVISION_MANUAL o ERROR), sus motivos y lo que leyó, para que el
-- revisor pueda ver qué encontró, sobre todo en los casos que deja para revisión manual.
-- Se revierte dropeando la tabla. ON DELETE CASCADE: las revisiones pertenecen al documento.

-- CreateTable
CREATE TABLE `user_document_ai_reviews` (
    `id` VARCHAR(36) NOT NULL,
    `user_documents_id` VARCHAR(36) NOT NULL,
    `decision` VARCHAR(20) NOT NULL,
    `motivo` TEXT NOT NULL,
    `observacion` TEXT NULL,
    `file_url` TEXT NULL,
    `resultado` JSON NULL,
    `modelo` VARCHAR(100) NULL,
    `duracion_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_document_ai_reviews_user_document`(`user_documents_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_document_ai_reviews` ADD CONSTRAINT `user_document_ai_reviews_user_documents_id_fkey` FOREIGN KEY (`user_documents_id`) REFERENCES `UserDocuments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

