-- M3: un proceso EN_PROCESO por cada participante actual. La tabla `procesos` nacio vacia en
-- 20260820180000_create_procesos; aca se puebla. Es un INSERT puro: no hay UPDATE, DELETE ni DROP,
-- asi que ningun dato del participante se toca (requisito del cliente: ninguna migracion puede
-- eliminar datos).
--
-- Alcance: TODOS los participantes, incluidos los que estan en INACTIVO. Los 2970 tienen filas en
-- UserDocuments, y el paso siguiente (M4) pone `UserDocuments.procesoId` en NOT NULL: si aca se
-- excluyera a alguien, su expediente quedaria sin proceso al que colgarse y M4 fallaria. Ademas
-- `User.status` es espejo del proceso activo, y sin proceso no habria de que ser espejo.
--
-- `status_documental` copia `User.status` tal cual: hoy es la unica fuente del estado documental y
-- el proceso pasa a ser el dueño historico de ese dato. Los dos son el mismo enum.
--
-- `fecha_ingreso` copia `User.created_at`. Es el ingreso del participante al programa, que para
-- estos procesos retroactivos es lo mas cercano a la verdad que hay en base; `created_at` del
-- proceso si es ahora, porque la fila se crea ahora.
--
-- `temporada_id` aplica la misma regla que usara el codigo: temporada activa del programa y, si hay
-- varias, la ultima creada. Para Work and Travel USA eso resuelve a "2026 - 2027" (la 2027-2028
-- existe con status = 0). Un programa sin temporada activa deja el campo en NULL, que es nullable
-- a proposito: hoy es el caso de Internship USA.
--
-- `sponsor_id` se copia directo. La regla del negocio es que el sponsor solo cuenta con
-- `status_hired = 1`, y se verifico contra la base que no hay ningun participante con sponsor y
-- `status_hired <> 1`, asi que copiar la columna y aplicar la regla dan el mismo resultado. Los
-- 1090 sin sponsor quedan con NULL: proceso sin sponsor, solo documentos generales.
--
-- `activo = 1` en todos. La unicidad `uq_proceso_activo(participante_id, activo)` deja como mucho
-- un proceso abierto por participante, y este SELECT produce una sola fila por usuario, de modo que
-- si la migracion llegara a violar el indice significaria que el supuesto es falso; en ese caso se
-- quiere que falle a gritos y no que corrompa en silencio.
--
-- El `NOT EXISTS` no es idempotencia decorativa: en produccion el contenedor corre
-- `migrate deploy` al arrancar, y si por cualquier via ya existiera un proceso para alguien,
-- preferimos saltearlo a que el deploy entero se caiga. Las columnas NOT NULL siguen fallando
-- fuerte si un participante nuevo entrara sin programa, opcion o pais.

INSERT INTO `procesos` (
    `id`,
    `participante_id`,
    `program_id`,
    `option_program_id`,
    `sponsor_id`,
    `country_id`,
    `temporada_id`,
    `fecha_ingreso`,
    `estado`,
    `status_documental`,
    `activo`,
    `created_at`,
    `updated_at`
)
SELECT
    UUID_v4(),
    u.`id`,
    u.`programId`,
    u.`optionProgramId`,
    u.`sponsorId`,
    u.`countryId`,
    (
        SELECT t.`id`
          FROM `Temporada` t
         WHERE t.`programId` = u.`programId`
           AND t.`status` = 1
         ORDER BY t.`createAt` DESC
         LIMIT 1
    ),
    u.`created_at`,
    'EN_PROCESO',
    u.`status`,
    1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  FROM `User` u
  JOIN `Role` r ON r.`id` = u.`role_id`
 WHERE r.`code` = 'PARTICIPANTE'
   AND NOT EXISTS (
        SELECT 1 FROM `procesos` p WHERE p.`participante_id` = u.`id`
   );
