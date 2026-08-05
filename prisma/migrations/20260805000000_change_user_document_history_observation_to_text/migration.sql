-- Alinea `UserDocumentHistory.observation` con el schema, que la declara `String? @db.Text`
-- desde hace tiempo sin que nunca se generara la migración correspondiente: en la base seguía
-- siendo el `VARCHAR(191)` creado por la migración inicial.
--
-- Con 191 caracteres, cualquier observación más larga hacía fallar el INSERT
-- ("The provided value for the column is too long") y, al estar dentro de una transacción,
-- se perdía además el cambio de estado del documento y del participante. Afectaba tanto a la
-- revisión masiva de pasaportes como a cualquier observación manual extensa.
--
-- La ampliación no puede perder datos: la observación más larga registrada ocupa 190 caracteres.

-- AlterTable
ALTER TABLE `UserDocumentHistory` MODIFY `observation` TEXT NULL;
