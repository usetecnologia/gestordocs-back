-- Consolidación de OptionProgram: ahora se identifica por (programId, shortDatabase).
-- Se eliminan las asociaciones con país y sponsor, y los campos idExterno, name, shortName y hideJobFair.
-- Se conserva la relación con Program y el campo status.

-- Reset total: se vacía la tabla para poder aplicar el índice único consolidado.
-- Los User.optionProgramId caen a NULL por la FK `User_optionProgramId_fkey` (ON DELETE SET NULL).
-- NO se borra ninguna fila de User ni de ninguna otra tabla — solo se limpia esa columna.
DELETE FROM `OptionProgram`;

-- DropForeignKey (country y sponsor; se conserva la de programId)
ALTER TABLE `OptionProgram` DROP FOREIGN KEY `OptionProgram_countryId_fkey`;
ALTER TABLE `OptionProgram` DROP FOREIGN KEY `OptionProgram_sponsorId_fkey`;

-- DropIndex (índices implícitos de las FKs eliminadas)
DROP INDEX `OptionProgram_countryId_fkey` ON `OptionProgram`;
DROP INDEX `OptionProgram_sponsorId_fkey` ON `OptionProgram`;

-- DropColumn
ALTER TABLE `OptionProgram`
    DROP COLUMN `idExterno`,
    DROP COLUMN `name`,
    DROP COLUMN `shortName`,
    DROP COLUMN `countryId`,
    DROP COLUMN `sponsorId`,
    DROP COLUMN `hideJobFair`;

-- CreateIndex (clave única consolidada por programa + shortDatabase)
CREATE UNIQUE INDEX `OptionProgram_programId_shortDatabase_key` ON `OptionProgram`(`programId`, `shortDatabase`);
