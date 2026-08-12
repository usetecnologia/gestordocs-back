-- Tabla: Country
CREATE TABLE `Country` (
  `id` varchar(191) NOT NULL,
  `idExterno` varchar(191) DEFAULT NULL,
  `code` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `currency` varchar(191) DEFAULT NULL,
  `countryCode` varchar(191) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `createAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updateAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Country_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: Etiquetas
CREATE TABLE `Etiquetas` (
  `id` varchar(36) NOT NULL,
  `name` varchar(191) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `created_by_id` varchar(36) DEFAULT NULL,
  `updated_by_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Etiquetas_created_by_id_fkey` (`created_by_id`),
  KEY `Etiquetas_updated_by_id_fkey` (`updated_by_id`),
  CONSTRAINT `Etiquetas_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Etiquetas_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: OptionProgram
CREATE TABLE `OptionProgram` (
  `id` varchar(191) NOT NULL,
  `idExterno` varchar(191) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `shortName` varchar(191) NOT NULL,
  `shortDatabase` varchar(191) NOT NULL,
  `countryId` varchar(191) NOT NULL,
  `programId` varchar(191) NOT NULL,
  `sponsorId` varchar(191) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `hideJobFair` tinyint(1) NOT NULL,
  `createAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updateAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `OptionProgram_countryId_fkey` (`countryId`),
  KEY `OptionProgram_programId_fkey` (`programId`),
  KEY `OptionProgram_sponsorId_fkey` (`sponsorId`),
  CONSTRAINT `OptionProgram_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `OptionProgram_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `OptionProgram_sponsorId_fkey` FOREIGN KEY (`sponsorId`) REFERENCES `Sponsor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: Person
CREATE TABLE `Person` (
  `id` varchar(36) NOT NULL,
  `firstname` varchar(191) NOT NULL,
  `middlename` varchar(191) DEFAULT NULL,
  `lastfathername` varchar(191) NOT NULL,
  `lastmothername` varchar(191) DEFAULT NULL,
  `birthdate` varchar(191) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `avatar` varchar(500) DEFAULT NULL,
  `dni` varchar(20) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Person_dni_key` (`dni`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: Program
CREATE TABLE `Program` (
  `id` varchar(191) NOT NULL,
  `idExterno` varchar(191) DEFAULT NULL,
  `code` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `createAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updateAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Program_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: Role
CREATE TABLE `Role` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` varchar(50) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Role_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: Sponsor
CREATE TABLE `Sponsor` (
  `id` varchar(191) NOT NULL,
  `idExterno` varchar(191) DEFAULT NULL,
  `code` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `createAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updateAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Sponsor_code_key` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: User
CREATE TABLE `User` (
  `id` varchar(36) NOT NULL,
  `username` varchar(191) DEFAULT NULL,
  `password` varchar(191) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `role_id` varchar(36) NOT NULL,
  `countryId` varchar(191) DEFAULT NULL,
  `sponsorId` varchar(191) DEFAULT NULL,
  `programId` varchar(191) DEFAULT NULL,
  `optionProgramId` varchar(191) DEFAULT NULL,
  `status` enum('SIN_DOCUMENTOS','DOCUMENTOS_SUBIDOS','DOCUMENTOS_INCOMPLETOS','PENDIENTE_REVISAR','EN_REVISION','OBSERVADO','RETENIDO_USE','PREPARACION','ENVIADO_SPONSOR','OBSERVADO_SPONSOR','RECHAZADO_SPONSOR','APROBADO_SPONSOR','DS2019_EMITIDO','RETIRADO','ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `employer` varchar(191) DEFAULT NULL,
  `fechaDSinUSE` varchar(191) DEFAULT NULL,
  `fechadeenvioalsponsor` varchar(191) DEFAULT NULL,
  `hired_date` varchar(191) DEFAULT NULL,
  `jo_use_date` varchar(191) DEFAULT NULL,
  `programAgreementOK` tinyint(1) DEFAULT NULL,
  `statusExternal` varchar(191) DEFAULT NULL,
  `statusSolRetiro` varchar(191) DEFAULT NULL,
  `status_hired` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `User_role_id_fkey` (`role_id`),
  KEY `User_countryId_fkey` (`countryId`),
  KEY `User_sponsorId_fkey` (`sponsorId`),
  KEY `User_programId_fkey` (`programId`),
  KEY `User_optionProgramId_fkey` (`optionProgramId`),
  CONSTRAINT `User_countryId_fkey` FOREIGN KEY (`countryId`) REFERENCES `Country` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `User_optionProgramId_fkey` FOREIGN KEY (`optionProgramId`) REFERENCES `OptionProgram` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `User_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `User_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `Role` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `User_sponsorId_fkey` FOREIGN KEY (`sponsorId`) REFERENCES `Sponsor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserDocumentHistory
CREATE TABLE `UserDocumentHistory` (
  `id` varchar(36) NOT NULL,
  `userDocumentsId` varchar(191) NOT NULL,
  `status` enum('PENDIENTE','SUBIDO','EN_REVISION','OBSERVADO','REVISADO') NOT NULL,
  `url` text DEFAULT NULL,
  `observation` varchar(191) DEFAULT NULL,
  `created_by_id` varchar(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `UserDocumentHistory_created_by_id_fkey` (`created_by_id`),
  KEY `UserDocumentHistory_userDocumentsId_fkey` (`userDocumentsId`),
  CONSTRAINT `UserDocumentHistory_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserDocumentHistory_userDocumentsId_fkey` FOREIGN KEY (`userDocumentsId`) REFERENCES `UserDocuments` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserDocumentHistoryEtiquetas
CREATE TABLE `UserDocumentHistoryEtiquetas` (
  `id` varchar(36) NOT NULL,
  `userDocumentHistoryId` varchar(36) NOT NULL,
  `etiquetaId` varchar(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `UserDocumentHistoryEtiquetas_userDocumentHistoryId_fkey` (`userDocumentHistoryId`),
  KEY `UserDocumentHistoryEtiquetas_etiquetaId_fkey` (`etiquetaId`),
  CONSTRAINT `UserDocumentHistoryEtiquetas_etiquetaId_fkey` FOREIGN KEY (`etiquetaId`) REFERENCES `Etiquetas` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `UserDocumentHistoryEtiquetas_userDocumentHistoryId_fkey` FOREIGN KEY (`userDocumentHistoryId`) REFERENCES `UserDocumentHistory` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserDocumentObservationFiles
CREATE TABLE `UserDocumentObservationFiles` (
  `id` varchar(36) NOT NULL,
  `userDocumentHistoryId` varchar(191) NOT NULL,
  `file` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `UserDocumentObservationFiles_userDocumentHistoryId_fkey` (`userDocumentHistoryId`),
  CONSTRAINT `UserDocumentObservationFiles_userDocumentHistoryId_fkey` FOREIGN KEY (`userDocumentHistoryId`) REFERENCES `UserDocumentHistory` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserDocuments
CREATE TABLE `UserDocuments` (
  `id` varchar(36) NOT NULL,
  `documentSponsorId` varchar(191) DEFAULT NULL,
  `documentId` varchar(191) DEFAULT NULL,
  `userId` varchar(191) NOT NULL,
  `status` enum('PENDIENTE','SUBIDO','EN_REVISION','OBSERVADO','REVISADO') NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `status_document` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `UserDocuments_documentSponsorId_fkey` (`documentSponsorId`),
  KEY `UserDocuments_documentId_fkey` (`documentId`),
  KEY `UserDocuments_userId_fkey` (`userId`),
  CONSTRAINT `UserDocuments_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserDocuments_documentSponsorId_fkey` FOREIGN KEY (`documentSponsorId`) REFERENCES `document_sponsors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserDocuments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserHistoryStatus
CREATE TABLE `UserHistoryStatus` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `status` enum('SIN_DOCUMENTOS','DOCUMENTOS_SUBIDOS','DOCUMENTOS_INCOMPLETOS','PENDIENTE_REVISAR','EN_REVISION','OBSERVADO','RETENIDO_USE','PREPARACION','ENVIADO_SPONSOR','OBSERVADO_SPONSOR','RECHAZADO_SPONSOR','APROBADO_SPONSOR','DS2019_EMITIDO','RETIRADO','ACTIVO','INACTIVO') NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `created_by_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `UserHistoryStatus_userId_fkey` (`userId`),
  CONSTRAINT `UserHistoryStatus_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserObservationEtiquetas
CREATE TABLE `UserObservationEtiquetas` (
  `id` varchar(36) NOT NULL,
  `userObservationId` varchar(191) NOT NULL,
  `etiquetaId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `UserObservationEtiquetas_userObservationId_fkey` (`userObservationId`),
  KEY `UserObservationEtiquetas_etiquetaId_fkey` (`etiquetaId`),
  CONSTRAINT `UserObservationEtiquetas_etiquetaId_fkey` FOREIGN KEY (`etiquetaId`) REFERENCES `Etiquetas` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `UserObservationEtiquetas_userObservationId_fkey` FOREIGN KEY (`userObservationId`) REFERENCES `UserObservations` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserObservationFiles
CREATE TABLE `UserObservationFiles` (
  `id` varchar(36) NOT NULL,
  `userObservationId` varchar(191) NOT NULL,
  `file` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `UserObservationFiles_userObservationId_fkey` (`userObservationId`),
  CONSTRAINT `UserObservationFiles_userObservationId_fkey` FOREIGN KEY (`userObservationId`) REFERENCES `UserObservations` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserObservations
CREATE TABLE `UserObservations` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `observation` text NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `endDate` datetime(3) DEFAULT NULL,
  `created_by_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `UserObservations_userId_fkey` (`userId`),
  KEY `UserObservations_created_by_id_fkey` (`created_by_id`),
  CONSTRAINT `UserObservations_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserObservations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: _prisma_migrations
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) NOT NULL,
  `logs` text DEFAULT NULL,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `applied_steps_count` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: acciones_correo
CREATE TABLE `acciones_correo` (
  `id` varchar(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `code` varchar(50) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `acciones_correo_code_key` (`code`),
  KEY `idx_email_actions_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: document_program_description_countries
CREATE TABLE `document_program_description_countries` (
  `id` varchar(36) NOT NULL,
  `document_program_description_id` varchar(36) NOT NULL,
  `document_program_id` varchar(36) NOT NULL,
  `country_id` varchar(36) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_document_program_country` (`document_program_id`,`country_id`),
  KEY `idx_dpd_countries_description` (`document_program_description_id`),
  KEY `idx_dpd_countries_country` (`country_id`),
  CONSTRAINT `document_program_description_countries_country_id_fkey` FOREIGN KEY (`country_id`) REFERENCES `Country` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `document_program_description_countries_document_program_des_fkey` FOREIGN KEY (`document_program_description_id`) REFERENCES `document_program_descriptions` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `document_program_description_countries_document_program_id_fkey` FOREIGN KEY (`document_program_id`) REFERENCES `document_programs` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: document_program_descriptions
CREATE TABLE `document_program_descriptions` (
  `id` varchar(36) NOT NULL,
  `document_program_id` varchar(36) NOT NULL,
  `description` text NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `order` int(11) NOT NULL DEFAULT 0,
  `title` varchar(200) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_document_program_descriptions_document_program` (`document_program_id`),
  CONSTRAINT `document_program_descriptions_document_program_id_fkey` FOREIGN KEY (`document_program_id`) REFERENCES `document_programs` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: document_programs
CREATE TABLE `document_programs` (
  `id` varchar(36) NOT NULL,
  `document_id` varchar(36) NOT NULL,
  `program_id` varchar(36) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_document_program` (`document_id`,`program_id`),
  KEY `idx_document_programs_document` (`document_id`),
  KEY `idx_document_programs_program` (`program_id`),
  CONSTRAINT `document_programs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `document_programs_program_id_fkey` FOREIGN KEY (`program_id`) REFERENCES `Program` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: document_sponsors
CREATE TABLE `document_sponsors` (
  `id` varchar(36) NOT NULL,
  `document_id` varchar(36) NOT NULL,
  `sponsor_id` varchar(36) NOT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_id` varchar(36) DEFAULT NULL,
  `updated_by_id` varchar(36) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_document_sponsor` (`document_id`,`sponsor_id`),
  KEY `idx_document_sponsors_document` (`document_id`),
  KEY `idx_document_sponsors_sponsor` (`sponsor_id`),
  KEY `idx_document_sponsors_created_by` (`created_by_id`),
  KEY `document_sponsors_updated_by_id_fkey` (`updated_by_id`),
  CONSTRAINT `document_sponsors_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `document_sponsors_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `document_sponsors_sponsor_id_fkey` FOREIGN KEY (`sponsor_id`) REFERENCES `Sponsor` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `document_sponsors_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: documents
CREATE TABLE `documents` (
  `id` varchar(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `type` enum('DOCUMENT','INFORMATIVE') NOT NULL,
  `formats` varchar(500) DEFAULT NULL,
  `show_hired` enum('HIRED','NOT_HIRED','ALL') NOT NULL,
  `title` varchar(191) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_id` varchar(36) DEFAULT NULL,
  `updated_by_id` varchar(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  `order` int(11) DEFAULT NULL,
  `siglasCode` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_documents_type` (`type`),
  KEY `idx_documents_show_hired` (`show_hired`),
  KEY `idx_documents_status` (`status`),
  KEY `idx_documents_created_by` (`created_by_id`),
  KEY `documents_updated_by_id_fkey` (`updated_by_id`),
  CONSTRAINT `documents_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `documents_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: historial_correos
CREATE TABLE `historial_correos` (
  `id` varchar(36) NOT NULL,
  `action_id` varchar(36) DEFAULT NULL,
  `action_code` varchar(50) NOT NULL,
  `template_id` varchar(36) DEFAULT NULL,
  `template_code` varchar(50) DEFAULT NULL,
  `recipient_user_id` varchar(36) DEFAULT NULL,
  `recipient_email` varchar(150) DEFAULT NULL,
  `subject` varchar(200) DEFAULT NULL,
  `status` enum('ENVIADO','FALLIDO','OMITIDO') NOT NULL,
  `source` enum('NORMAL','PROGRAMADA') NOT NULL,
  `error_message` text DEFAULT NULL,
  `sent_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `idx_email_log_recipient` (`recipient_user_id`),
  KEY `idx_email_log_action` (`action_id`),
  KEY `idx_email_log_template` (`template_id`),
  KEY `idx_email_log_status` (`status`),
  KEY `idx_email_log_sent_at` (`sent_at`),
  CONSTRAINT `historial_correos_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `acciones_correo` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `historial_correos_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `historial_correos_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `plantillas_correo` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: plantillas_correo
CREATE TABLE `plantillas_correo` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `code` varchar(50) NOT NULL,
  `subject` varchar(150) NOT NULL,
  `html_content` text NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `type` enum('NORMAL','PROGRAMADA') NOT NULL,
  `action_id` varchar(36) NOT NULL,
  `schedule` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`schedule`)),
  `created_by_id` varchar(36) DEFAULT NULL,
  `updated_by_id` varchar(36) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `plantillas_correo_code_key` (`code`),
  KEY `idx_email_templates_action` (`action_id`),
  KEY `idx_email_templates_status` (`status`),
  KEY `idx_email_templates_type` (`type`),
  KEY `plantillas_correo_created_by_id_fkey` (`created_by_id`),
  KEY `plantillas_correo_updated_by_id_fkey` (`updated_by_id`),
  CONSTRAINT `plantillas_correo_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `acciones_correo` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `plantillas_correo_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `plantillas_correo_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
