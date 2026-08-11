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
  UNIQUE KEY `uq_user_documents_sponsor_active` (`userId`,`documentSponsorId`,`status_document`),
  UNIQUE KEY `uq_user_documents_document_active` (`userId`,`documentId`,`status_document`),
  KEY `UserDocuments_documentSponsorId_fkey` (`documentSponsorId`),
  KEY `UserDocuments_documentId_fkey` (`documentId`),
  CONSTRAINT `UserDocuments_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserDocuments_documentSponsorId_fkey` FOREIGN KEY (`documentSponsorId`) REFERENCES `document_sponsors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserDocuments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla: UserDocumentHistory
CREATE TABLE `UserDocumentHistory` (
  `id` varchar(36) NOT NULL,
  `userDocumentsId` varchar(191) NOT NULL,
  `status` enum('PENDIENTE','SUBIDO','EN_REVISION','OBSERVADO','REVISADO') NOT NULL,
  `url` text DEFAULT NULL,
  `observation` text DEFAULT NULL,
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
