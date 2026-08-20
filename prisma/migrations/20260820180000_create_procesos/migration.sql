-- Tabla `procesos`: una participacion del alumno en un ciclo. Nace VACIA — el backfill de los
-- participantes actuales va en una migracion aparte (M3), para que crear la estructura y mover
-- datos sean dos pasos verificables por separado.
--
-- Sobre los tipos de las claves foraneas: `participante_id` y `finalizado_by_id` son VARCHAR(36)
-- porque User.id lo es; programa, opcion, sponsor, pais y temporada son VARCHAR(191) porque esos
-- modelos usan el String por defecto de Prisma. MariaDB exige que la FK coincida exactamente con
-- la columna referenciada.
--
-- `uq_proceso_activo(participante_id, activo)` es lo que garantiza un solo proceso abierto por
-- participante: `activo` vale 1 mientras esta EN_PROCESO y NULL al finalizar, y los NULL no
-- colisionan en un indice unico de MySQL/MariaDB. Nunca vale 0.
--
-- Todas las FK son RESTRICT: un proceso FINALIZADO esta congelado, y un ON DELETE SET NULL le
-- vaciaria campos por la espalda al borrarse un sponsor o una temporada.


-- CreateTable
CREATE TABLE `procesos` (
    `id` VARCHAR(36) NOT NULL,
    `participante_id` VARCHAR(36) NOT NULL,
    `program_id` VARCHAR(191) NOT NULL,
    `option_program_id` VARCHAR(191) NOT NULL,
    `sponsor_id` VARCHAR(191) NULL,
    `country_id` VARCHAR(191) NOT NULL,
    `temporada_id` VARCHAR(191) NULL,
    `fecha_ingreso` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `estado` ENUM('EN_PROCESO', 'FINALIZADO') NOT NULL DEFAULT 'EN_PROCESO',
    `status_documental` ENUM('SIN_DOCUMENTOS', 'DOCUMENTOS_SUBIDOS', 'DOCUMENTOS_INCOMPLETOS', 'PENDIENTE_REVISAR', 'EN_REVISION', 'OBSERVADO', 'RETENIDO_USE', 'PREPARACION', 'ENVIADO_SPONSOR', 'OBSERVADO_SPONSOR', 'RECHAZADO_SPONSOR', 'APROBADO_SPONSOR', 'DS2019_EMITIDO', 'RETIRADO', 'ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'SIN_DOCUMENTOS',
    `activo` BOOLEAN NULL,
    `finalizado_at` DATETIME(3) NULL,
    `finalizado_by_id` VARCHAR(36) NULL,
    `crm_proceso_id` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_procesos_participante`(`participante_id`, `fecha_ingreso`),
    INDEX `idx_procesos_estado`(`estado`),
    UNIQUE INDEX `uq_proceso_activo`(`participante_id`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_participante_id_fkey` FOREIGN KEY (`participante_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_finalizado_by_id_fkey` FOREIGN KEY (`finalizado_by_id`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_option_program_id_fkey` FOREIGN KEY (`option_program_id`) REFERENCES `OptionProgram`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `Sponsor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `Country`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `procesos` ADD CONSTRAINT `procesos_temporada_id_fkey` FOREIGN KEY (`temporada_id`) REFERENCES `Temporada`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

