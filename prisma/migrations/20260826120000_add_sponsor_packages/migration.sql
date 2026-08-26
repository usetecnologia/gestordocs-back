-- Paquetes de descarga por sponsor: las reglas que arman el ZIP que se le manda al sponsor pasan de
-- constantes en `SponsorDocumentBuilder` a datos administrables.
--
-- Cinco tablas nuevas, TODAS vacias. Ninguna tabla existente se altera: no hay ADD COLUMN, ni
-- UPDATE, ni DROP. La migracion es puramente aditiva y por lo tanto reversible sin perdida — basta
-- con dropear las cinco tablas.
--
-- El seed que replica los cinco paquetes actuales (ASPIRE, UNITED, INTRAX, CENET, AAG) va aparte,
-- en `prisma/seed-sponsor-packages.ts`, para que crear la estructura y cargar los datos sean dos
-- pasos verificables por separado. Mientras `SPONSOR_PACKAGES_FROM_DB` este apagado estas tablas no
-- las lee nadie.
--
-- Sobre los tipos de las claves foraneas: `document_id`, `created_by_id` y `updated_by_id` son
-- VARCHAR(36) porque Documents.id y User.id lo son; `sponsor_id`, `program_id` y `country_id` son
-- VARCHAR(191) porque Sponsor, Program y Country usan el String por defecto de Prisma. MariaDB
-- exige que la FK coincida exactamente con la columna referenciada. Es la misma razon por la que
-- `procesos` las declara asi.
--
-- Sobre los ON DELETE:
--   * Los hijos del arbol de configuracion (outputs, sources, stamps, inputs) son CASCADE: le
--     pertenecen al paquete y no tienen sentido sueltos. Ademas es lo que permite que el update
--     "replace-all" del formulario borre y recree sin dejar huerfanos.
--   * Las referencias a catalogos (sponsor, programa, pais, documento) son RESTRICT: borrar un
--     documento que una regla usa debe fallar, no vaciar la regla por la espalda.
--   * `created_by_id` / `updated_by_id` son SET NULL: si se borra el usuario que la edito, la regla
--     sigue siendo valida y solo se pierde la autoria.
--
-- NO se crea `UNIQUE(sponsor_id, program_id, country_id)` a proposito. MariaDB considera cada NULL
-- distinto, asi que ese indice permitiria dos paquetes con (UNITED, NULL, NULL) — justo el caso que
-- hay que impedir. La unicidad del alcance se valida en el use case.


-- CreateTable
CREATE TABLE `sponsor_packages` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `sponsor_id` VARCHAR(191) NOT NULL,
    `program_id` VARCHAR(191) NULL,
    `country_id` VARCHAR(191) NULL,
    `structure` ENUM('ARCHIVO_SUELTO', 'CARPETA_POR_PARTICIPANTE') NOT NULL DEFAULT 'CARPETA_POR_PARTICIPANTE',
    `folder_path_template` VARCHAR(300) NOT NULL DEFAULT '{PROGRAMA}/{PAIS}/{SPONSOR}',
    `item_name_template` VARCHAR(300) NOT NULL DEFAULT '{dni} - {apellidos}, {nombres}',
    `fallback_programa` VARCHAR(100) NOT NULL DEFAULT 'SIN PROGRAMA',
    `fallback_pais` VARCHAR(100) NOT NULL DEFAULT 'SIN PAIS',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_by_id` VARCHAR(36) NULL,
    `updated_by_id` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sponsor_packages_sponsor`(`sponsor_id`),
    INDEX `idx_sponsor_packages_program`(`program_id`),
    INDEX `idx_sponsor_packages_country`(`country_id`),
    INDEX `idx_sponsor_packages_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsor_package_inputs` (
    `id` VARCHAR(36) NOT NULL,
    `package_id` VARCHAR(36) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `label` VARCHAR(150) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `max_size_mb` INTEGER NOT NULL DEFAULT 10,
    `archive_to_s3` BOOLEAN NOT NULL DEFAULT false,
    `s3_folder` VARCHAR(150) NULL,
    `archive_filename` VARCHAR(150) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sponsor_package_inputs_package`(`package_id`),
    UNIQUE INDEX `uq_sponsor_package_input`(`package_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsor_package_outputs` (
    `id` VARCHAR(36) NOT NULL,
    `package_id` VARCHAR(36) NOT NULL,
    `filename` VARCHAR(150) NOT NULL,
    `mode` ENUM('PDF_COMBINADO', 'ARCHIVO_ORIGINAL') NOT NULL DEFAULT 'PDF_COMBINADO',
    `order` INTEGER NOT NULL DEFAULT 0,
    `emit_when_empty` BOOLEAN NOT NULL DEFAULT false,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sponsor_package_outputs_package`(`package_id`),
    UNIQUE INDEX `uq_sponsor_package_output`(`package_id`, `filename`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsor_package_output_sources` (
    `id` VARCHAR(36) NOT NULL,
    `output_id` VARCHAR(36) NOT NULL,
    `document_id` VARCHAR(36) NULL,
    `input_id` VARCHAR(36) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `on_missing` ENUM('OMITIR_FUENTE', 'OMITIR_ARCHIVO', 'OMITIR_PARTICIPANTE') NOT NULL DEFAULT 'OMITIR_FUENTE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sponsor_package_sources_output`(`output_id`),
    INDEX `idx_sponsor_package_sources_document`(`document_id`),
    INDEX `idx_sponsor_package_sources_input`(`input_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsor_package_output_stamps` (
    `id` VARCHAR(36) NOT NULL,
    `output_id` VARCHAR(36) NOT NULL,
    `asset_url` TEXT NOT NULL,
    `only_document_id` VARCHAR(36) NULL,
    `width_pt` INTEGER NOT NULL DEFAULT 120,
    `margin_x_pt` INTEGER NOT NULL DEFAULT 20,
    `margin_y_pt` INTEGER NOT NULL DEFAULT 90,
    `anchor` ENUM('BOTTOM_RIGHT', 'BOTTOM_LEFT', 'TOP_RIGHT', 'TOP_LEFT') NOT NULL DEFAULT 'BOTTOM_RIGHT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sponsor_package_stamps_output`(`output_id`),
    INDEX `idx_sponsor_package_stamps_document`(`only_document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sponsor_packages` ADD CONSTRAINT `sponsor_packages_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `Sponsor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_packages` ADD CONSTRAINT `sponsor_packages_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_packages` ADD CONSTRAINT `sponsor_packages_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `Country`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_packages` ADD CONSTRAINT `sponsor_packages_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_packages` ADD CONSTRAINT `sponsor_packages_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_inputs` ADD CONSTRAINT `sponsor_package_inputs_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `sponsor_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_outputs` ADD CONSTRAINT `sponsor_package_outputs_package_id_fkey` FOREIGN KEY (`package_id`) REFERENCES `sponsor_packages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_output_sources` ADD CONSTRAINT `sponsor_package_output_sources_output_id_fkey` FOREIGN KEY (`output_id`) REFERENCES `sponsor_package_outputs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_output_sources` ADD CONSTRAINT `sponsor_package_output_sources_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_output_sources` ADD CONSTRAINT `sponsor_package_output_sources_input_id_fkey` FOREIGN KEY (`input_id`) REFERENCES `sponsor_package_inputs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_output_stamps` ADD CONSTRAINT `sponsor_package_output_stamps_output_id_fkey` FOREIGN KEY (`output_id`) REFERENCES `sponsor_package_outputs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsor_package_output_stamps` ADD CONSTRAINT `sponsor_package_output_stamps_only_document_id_fkey` FOREIGN KEY (`only_document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
