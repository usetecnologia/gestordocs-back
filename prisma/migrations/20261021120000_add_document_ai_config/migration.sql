-- Configuración de revisión con IA por documento (pestaña "IA" del formulario de documentos).
--
-- Puramente aditiva: tres columnas nuevas en `documents`, ninguna obligatoria sin default. Los
-- documentos existentes quedan con la IA apagada (`ai_enabled = false`) y sin perfil, que es
-- exactamente el comportamiento actual. Se revierte dropeando las tres columnas.
--
-- `ai_profile` define qué se extrae (el prompt base y el esquema viven en código) y
-- `ai_instructions` son indicaciones adicionales del administrador.

-- AlterTable
ALTER TABLE `documents`
    ADD COLUMN `ai_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `ai_profile` ENUM('PASSPORT') NULL,
    ADD COLUMN `ai_instructions` TEXT NULL;
