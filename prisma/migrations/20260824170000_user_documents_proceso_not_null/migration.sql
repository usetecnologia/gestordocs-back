-- M4 (segunda mitad): `UserDocuments.proceso_id` pasa a NOT NULL.
--
-- Cierra el paso 4. Se separo de 20260824140000 porque el NOT NULL no era seguro hasta que
-- existiera `EnsureProcesoInicial`: el sync le arma el expediente al participante en el mismo
-- momento del alta, y hasta entonces no habia nada que le garantizara un proceso antes. Ahora el
-- sync abre el proceso primero y, si no puede, no toca el expediente — asi que ninguna fila nueva
-- puede nacer sin proceso.
--
-- El UPDATE de arriba es el mismo de la migracion anterior y es idempotente a proposito: barre las
-- filas que se hayan creado entre las dos migraciones, cuando la columna todavia admitia NULL. Si
-- no quedo ninguna, actualiza 0 filas.
--
-- Si alguna fila quedara sin proceso, el MODIFY falla y la migracion se detiene. Eso es lo que se
-- quiere: MariaDB, ante un NOT NULL con valores nulos, los reemplazaria por el valor por defecto
-- del tipo en vez de avisar, y con `sql_mode` estricto —el de esta base— aborta. Fallar es
-- correcto; inventar un proceso para una fila huerfana, no.


-- Backfill de las filas creadas mientras la columna admitia NULL
UPDATE `UserDocuments` ud
   SET ud.`proceso_id` = (
       SELECT p.`id`
         FROM `procesos` p
        WHERE p.`participante_id` = ud.`userId`
        ORDER BY p.`activo` IS NULL, p.`fecha_ingreso` DESC
        LIMIT 1
   )
 WHERE ud.`proceso_id` IS NULL;

-- AlterTable
ALTER TABLE `UserDocuments` MODIFY `proceso_id` VARCHAR(36) NOT NULL;
