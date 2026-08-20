-- Revierte los indices unicos creados en 20260730120000_add_user_documents_active_unique.
--
-- Su clave incluia `status_document`, con la idea de que los registros historicos pudieran
-- convivir con el vigente. Eso solo se sostiene mientras haya UN historico por par: en cuanto
-- la aplicacion desactiva el registro activo (UpdateDocumentUseCase -> userDocuments.updateMany
-- con statusDocument: false, al cambiar el estado del documento o al asignarle sponsors),
-- quedan dos filas identicas (userId, documentId, 0) y el indice falla.
--
-- Sintoma: PATCH /api/documents/:id -> 500
--   "Unique constraint failed on the constraint: uq_user_documents_document_active"
-- Alcance: 104 pares con un activo y un historico, 39 de ellos en un mismo documento.
--
-- La consolidacion de duplicados que hizo aquella migracion SE CONSERVA: no se reactiva ni se
-- borra nada, solo se retiran las dos restricciones. Volver a intentar la garantia requiere un
-- indice parcial sobre los activos, que MariaDB no soporta de forma nativa.

-- DropIndex
DROP INDEX `uq_user_documents_document_active` ON `UserDocuments`;

-- DropIndex
DROP INDEX `uq_user_documents_sponsor_active` ON `UserDocuments`;
