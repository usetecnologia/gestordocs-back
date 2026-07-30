-- Consolida los documentos duplicados de participantes y evita que vuelvan a generarse.
--
-- Origen del problema: `SyncUserDocumentsUseCase` lee los documentos existentes del participante
-- y luego inserta los que faltan. Sin ninguna restricción de unicidad, dos ejecuciones concurrentes
-- del sync (autologin + carga de documentos, revisiones masivas, etc.) leían el estado antes de que
-- la otra insertara y ambas creaban el MISMO vínculo. Se detectaron 3 casos, todos con diferencias
-- de creación de 1 a 6 milisegundos, lo que confirma la concurrencia como única causa.
--
-- Nada se elimina: de cada grupo duplicado se conserva activo el registro con la actividad más
-- reciente y el resto queda como histórico (`status_document` = 0), con su historial intacto.

-- 1. Consolidación de documentos ligados a un sponsor.
--    Se conserva activo el de última actividad (updated_at); los desempates por created_at e id
--    hacen el resultado determinista. `updated_at` se reasigna a su valor actual porque la columna
--    no tiene ON UPDATE: así el orden por actividad que usa el sync no se altera.
UPDATE `UserDocuments` `ud`
JOIN (
    SELECT `id`
    FROM (
        SELECT `id`,
               ROW_NUMBER() OVER (
                   PARTITION BY `userId`, `documentSponsorId`
                   ORDER BY `updated_at` DESC, `created_at` DESC, `id` DESC
               ) AS `rn`
        FROM `UserDocuments`
        WHERE `documentSponsorId` IS NOT NULL
          AND `status_document` = 1
    ) `ranked`
    WHERE `ranked`.`rn` > 1
) `duplicados` ON `duplicados`.`id` = `ud`.`id`
SET `ud`.`status_document` = 0,
    `ud`.`updated_at` = `ud`.`updated_at`;

-- 2. Consolidación de documentos globales (sin sponsor), con el mismo criterio.
UPDATE `UserDocuments` `ud`
JOIN (
    SELECT `id`
    FROM (
        SELECT `id`,
               ROW_NUMBER() OVER (
                   PARTITION BY `userId`, `documentId`
                   ORDER BY `updated_at` DESC, `created_at` DESC, `id` DESC
               ) AS `rn`
        FROM `UserDocuments`
        WHERE `documentId` IS NOT NULL
          AND `status_document` = 1
    ) `ranked`
    WHERE `ranked`.`rn` > 1
) `duplicados` ON `duplicados`.`id` = `ud`.`id`
SET `ud`.`status_document` = 0,
    `ud`.`updated_at` = `ud`.`updated_at`;

-- 3. Unicidad a nivel de base de datos. Incluir `status_document` permite que los registros
--    históricos desactivados sigan conviviendo con el vigente, mientras impide dos ACTIVOS del
--    mismo documento para un mismo participante. Los NULL no colisionan en MariaDB, por lo que
--    cada registro queda cubierto solo por el índice que le corresponde.
CREATE UNIQUE INDEX `uq_user_documents_sponsor_active`
    ON `UserDocuments`(`userId`, `documentSponsorId`, `status_document`);

CREATE UNIQUE INDEX `uq_user_documents_document_active`
    ON `UserDocuments`(`userId`, `documentId`, `status_document`);
