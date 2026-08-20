# Migración a Procesos — estado y continuación

> **Para retomar sin contexto previo.** Este documento se basta a sí mismo: dice qué está hecho,
> qué decisiones se tomaron y por qué, qué falta, y qué NO hay que hacer.
>
> **Última actualización:** 2026-08-20
> **Plan original:** [`plan-gestor-procesos.md`](./plan-gestor-procesos.md) — sigue siendo la
> referencia de diseño, pero **contiene errores ya corregidos**: ver §3.
> **Base de datos usada:** `testdocs` en `161.132.45.31:3397`. Producción **no** ha sido tocada.

---

## 1. Resumen: dónde estamos

| Paso | Qué es | Estado |
|---|---|---|
| — | Temporada informativa en el catálogo de documentos | ✅ Hecho y desplegado |
| — | Drift de migraciones de la base | ✅ Resuelto |
| — | Revertir índices únicos de `UserDocuments` | ✅ Hecho (ver §4, importante) |
| **1** | `RolesGuard` + `@Roles` | ✅ Hecho |
| **2** | Tabla `procesos` + enum `ProcesoEstado` | ✅ Hecho (tabla vacía) |
| **3** | Backfill: un proceso por participante | ⬜ **Siguiente** |
| **4** | `UserDocuments.procesoId` | ⬜ Pendiente |
| **5** | Los cuatro casos de uso | ⬜ Pendiente |
| **6** | Congelar proceso finalizado + limpiar el sync | ⬜ Pendiente |
| **7** | `User.procesoVisibleId` y propagarlo | ⬜ Pendiente |
| **8** | Frontend | ⬜ Pendiente |

Estado de la base: `migrate status` → **up to date**, 31 migraciones, drift vacío.
`tsc` limpio en backend y frontend. 51 tests pasando.

---

## 2. Decisiones de negocio confirmadas por el cliente

Estas respuestas **modifican el plan original** y son las que valen:

1. **Finalizar un proceso** lo hace un usuario interno de USE — cualquiera que no sea
   `PARTICIPANTE`. Es decir: `ADMIN`, `SUPERVISOR`, `ASESOR`.

2. **Proceso finalizado + autologin: NO se bloquea el login.** El plan original decía
   "🚫 bloquea el login" — **eso quedó descartado**. El comportamiento correcto es:
   el participante entra, y el frontend le muestra una página *"Su proceso finalizó,
   ¿desea abrir uno nuevo?"*. Si pulsa el botón, **el propio participante crea el proceso nuevo**.
   ⇒ *Crear proceso* deja de ser exclusivo de USE. *Finalizar* sigue siéndolo.

3. **Se implementan las dos acciones**, "Nuevo proceso" y "Continuar":
   - *Nuevo proceso*: registro nuevo, documentos en `PENDIENTE`, `SIN_DOCUMENTOS`.
     Lo puede hacer USE **y** el participante.
   - *Continuar*: reabre el **mismo** registro conservando todo el avance. Es un
     "deshacer" para finalizaciones por error. Solo USE.

4. **Duplicados de documentos**: gana la fila activa; si hay dos activas, la de actividad más
   reciente. Las perdedoras **nunca se borran**: quedan como histórico.

5. **`estado` y `activo` se sincronizan** con un único método del repositorio, cubierto por un
   test. Sin triggers de base de datos.

6. **Orden de trabajo**: `RolesGuard` primero, después el proceso. La Fase 1 del plan
   (dimensiones país y opción en el catálogo) **queda fuera de alcance** por ahora.

### Requisito transversal del cliente

> **Ninguna migración puede eliminar datos**, en especial del participante: documentos,
> archivos subidos, historial.

Procedimiento que se viene aplicando y **hay que mantener**:

1. Auditar el SQL: `grep` de `DELETE`/`DROP`/`TRUNCATE`.
2. Auditar los datos afectados (¿alguien pierde acceso a un archivo?).
3. Censo de filas antes/después con `prisma/censo-filas.ts`.
4. Aplicar con `prisma migrate deploy`.
5. Comparar censos y confirmar delta 0.

---

## 3. Errores del plan original ya detectados

**No repetirlos.** El `plan-gestor-procesos.md` los contiene tal cual.

### 3.1 Tipos de las claves foráneas

El plan especifica `@db.VarChar(36)` para **todas** las FK de `Proceso`. Es incorrecto:

| Modelo | Tipo real de `id` |
|---|---|
| `User` | `VARCHAR(36)` |
| `Program`, `OptionProgram`, `Sponsor`, `Country`, `Temporada` | **`VARCHAR(191)`** |

MariaDB exige que la FK coincida exactamente con la columna referenciada. Con el schema del
plan, la tabla `procesos` no se puede crear. Ya corregido en el schema actual.

Aplica también a cualquier tabla futura que referencie esos modelos.

### 3.2 `ON DELETE SET NULL` en relaciones opcionales

Prisma genera `SET NULL` por defecto para relaciones opcionales. Contradice
"finalizado ⇒ nada alterable": borrar un sponsor le vaciaría el campo a procesos ya congelados.
En `Proceso` **todas** las FK quedaron en `RESTRICT`.

### 3.3 La pregunta abierta #1 del plan ya tiene respuesta

Roles reales en base: `ADMIN` (1 usuario), `PARTICIPANTE` (2965), `ASESOR` (7),
`SUPERVISOR` (0). Son cuatro, no dos.

---

## 4. ⛔ NO reintroducir los índices únicos de `UserDocuments`

Esto costó una caída en producción de pruebas. **Leer antes de tocar `UserDocuments`.**

La migración `20260730120000_add_user_documents_active_unique` creaba:

```sql
UNIQUE (userId, documentSponsorId, status_document)
UNIQUE (userId, documentId,        status_document)
```

**Por qué rompe:** el estado va *dentro* de la clave. La propia migración consolida duplicados
dejando una fila activa (`1`) y una histórica (`0`). Cuando `UpdateDocumentUseCase` desactiva la
activa (al cambiar el estado del documento o asignarle sponsors), esa fila pasa a `0` y choca con
la histórica que ya estaba en `0`.

**Síntoma:** `PATCH /api/documents/:id` → 500
`Unique constraint failed on the constraint: uq_user_documents_document_active`
Alcance medido: 104 pares afectados, 39 en un solo documento.

**Estado actual:** revertido por `20260820170000_drop_user_documents_active_unique`.
La consolidación de los 104 duplicados **se conservó** (era la parte buena).

**Contraste — el patrón que SÍ funciona**, usado en `procesos`:

| | Clave | Resultado |
|---|---|---|
| ❌ El que rompió | `(userId, documentId, status_document)` | Estado dentro de la clave → dos históricos colisionan |
| ✅ `uq_proceso_activo` | `(participante_id, activo)`, `activo = 1 \| NULL` | Los NULL no colisionan → N finalizados, 1 abierto |

La diferencia: **anular la clave cuando el registro se cierra**, en vez de meter el estado en ella.
Verificado contra la base real (ver §5.2).

Si algún día se quiere la garantía sobre `UserDocuments`, hay que emular un índice parcial con una
columna que valga `1` si está activo y `NULL` si no — y mantenerla sincronizada en **todos** los
puntos que tocan `statusDocument`.

---

## 5. Lo que ya está construido

### 5.1 Paso 1 — `RolesGuard`

| Archivo | Contenido |
|---|---|
| `src/common/enums/role-code.enum.ts` | `RoleCode`, `STAFF_ROLES`, `STAFF_AND_PARTICIPANT_ROLES` |
| `src/common/decorators/roles.decorator.ts` | `@Roles(...)`, `ROLES_KEY` |
| `src/common/guards/roles.guard.ts` | El guard |
| `src/common/guards/roles.guard.spec.ts` | 8 tests |

**Deniega por defecto**: un endpoint sin `@Roles` queda inaccesible (403). Es deliberado — así
olvidar el decorador cierra la ruta en vez de dejarla abierta. **Consecuencia práctica: todo
endpoint nuevo en un controller protegido necesita su `@Roles` o dará 403.**

Se usa siempre después del guard de autenticación, que es quien puebla `request.user`:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
```

Registrar **ambos** en los `providers` del módulo (patrón del proyecto: guards por módulo, no
globales).

Aplicado a `UserDocumentsController`, 13/13 endpoints:

- **Solo staff:** `aceptar-document`, `observar-document`, `bulk-aceptar-document`,
  `bulk-observar-document`, `terminar-revision`, `terminar-revision-masivo`,
  `bulk-upload-by-filename`, `revision-masiva-pasaporte`, `download-by-sponsor/bulk`,
  `download-by-sponsor/:userId`
- **Staff + participante:** `by-user/:userId`, `upload-file-document`, `documents-by-sponsor`

El JWT lleva `role.code ?? role.name` — igual en los tres caminos que firman token
(`autologin`, `login`, `refresh-token`).

### 5.2 Paso 2 — Tabla `procesos`

Migración `20260820180000_create_procesos`. **Tabla vacía**, sin tocar datos (censo delta 0).

Modelo `Proceso` en `prisma/schema.prisma`, ubicado antes de `model User`. Puntos clave:

- `uq_proceso_activo(participante_id, activo)` — un solo proceso abierto por participante
- `activo`: `true` si `EN_PROCESO`, `NULL` si `FINALIZADO`. **Nunca `false`**
- Todas las FK en `RESTRICT`
- `enum ProcesoEstado { EN_PROCESO, FINALIZADO }` → `proceso_estado`

Comportamiento verificado con inserciones reales en transacciones revertidas:

```
✅ un proceso abierto se inserta
✅ DOS abiertos para el mismo participante → rechazado  (ER_DUP_ENTRY)
✅ un abierto + varios finalizados (activo NULL) → permitido
✅ FK inválida → rechazada  (ER_NO_REFERENCED_ROW_2)
```

### 5.3 Trabajo previo relacionado

- **Temporada informativa** en `document_programs.temporadaId`
  (`20260820120000_add_temporada_to_document_program`). Es del **catálogo** y **no** filtra
  aplicabilidad. **Ojo: no confundirla con `proceso.temporadaId`**, que es la temporada del
  participante en ese ciclo y se resuelve automáticamente (temporada activa del programa; si hay
  varias, la última creada; `null` si no hay).
  Borrar una temporada en uso está bloqueado en `DeleteTemporadaUseCase` + `ON DELETE RESTRICT`.
- **Drift resuelto**: se aplicaron las migraciones de julio y agosto que llevaban meses pendientes.
- **`prisma.config.ts`** ahora deriva la URL de `HOST_DB`/`USER_DB`/`PASSWORD_DB`/`DATABASE_DB`
  (con `DATABASE_URL` como override). Sin esto, `migrate deploy` no funciona en producción, donde
  `DATABASE_URL` no existe.
- **`Dockerfile`** corre `npx prisma migrate deploy` antes de arrancar la app. Para eso, `prisma`
  se movió de `devDependencies` a `dependencies` y se copia `prisma.config.ts` a la imagen.
  ⚠️ **Nunca se construyó la imagen** (no había Docker en la máquina): hacer `docker build` y
  probar en un entorno de prueba antes de producción.

---

## 6. Lo que falta

### Paso 3 — Backfill de procesos (M3) ← siguiente

Crear un proceso `EN_PROCESO` por cada participante actual, copiando `programId`,
`optionProgramId`, `countryId`, `sponsorId` desde `User`, con `activo = 1` y
`statusDocumental = User.status`.

- **Bloqueante ya resuelto:** había un participante sin `optionProgramId` (columna `NOT NULL` en
  `procesos`). Es el usuario de prueba `123456781` / "Vane Test Chile"
  (`5aec12ed-f4f2-4466-9db3-e9fc8cf03438`); se le asignó la opción `CON`
  (`21d0405b-7774-497c-92a6-86380ae88694`) el 2026-08-20.
  **Verificar de nuevo antes de correr el backfill** — pueden haber entrado participantes nuevos:

  ```sql
  SELECT COUNT(*) FROM User
   WHERE role_id = (SELECT id FROM Role WHERE code='PARTICIPANTE')
     AND (programId IS NULL OR optionProgramId IS NULL OR countryId IS NULL);
  -- debe dar 0
  ```

- **Temporada:** el plan pide que los participantes de WAT USA nazcan con temporada 2026-2027.
  Hoy solo hay **2 temporadas** en base — confirmar que exista la correcta antes.
- Si algún participante quedara con dos filas `activo = 1`, la migración falla contra
  `uq_proceso_activo`. **Eso es lo deseado**: falla ruidosa, no corrupción silenciosa.
- Censo antes/después. Delta esperado: `procesos` pasa de 0 a ~2965; todo lo demás en 0.

### Paso 4 — `UserDocuments.procesoId`

Columna nullable → backfill (cada `UserDocuments` al proceso de su `userId`) → `NOT NULL`.

⚠️ **NO tocar `documentSponsorId` en este paso.** Ver §7.

### Paso 5 — Casos de uso

| Caso de uso | Quién | Qué hace |
|---|---|---|
| `EnsureProcesoInicial` | autologin + batch | Si no tiene ninguno, lo crea. Compartido por ambos caminos |
| `CrearNuevoProceso` | USE **y participante** | Registro nuevo, todo `PENDIENTE`, `SIN_DOCUMENTOS` |
| `ContinuarProceso` | Solo USE | Reabre el mismo registro, documentos intactos |
| `FinalizarProceso` | Solo USE, masivo | → `FINALIZADO`, `activo = NULL`, congela |

- Los datos del proceso nuevo salen del POST a `WorkuseService`. **Si falla, se aborta** y no se
  crea nada. Aplica también al botón del participante.
- Sponsor: se hereda la regla `status_hired === 1`. Sin contrato ⇒ proceso sin sponsor, solo
  documentos generales. **Hoy 1111 de 2965 participantes (37%) no tienen sponsor** — es normal.
- `estado` y `activo` se cambian **solo** desde un método del repositorio, con test (decisión §2.5).
- Un participante no puede abrir procesos en cadena: para abrir otro tendría que finalizar el
  actual, y eso no lo puede hacer él. La unicidad lo protege sola.

### Paso 6 — Congelar y limpiar el sync

- Si `estado = FINALIZADO`, `SyncUserDocumentsUseCase` no toca el expediente.
- **Eliminar** `cloneDocumentForNewSponsor`, `refreshDocumentFromLatest`, `parentDocByLinkId` y la
  heurística `bestRecord`: la herencia entre procesos desaparece por diseño.
- Cambio de sponsor o programa **con proceso abierto**: se actualiza el proceso y se recalcula el
  catálogo. Los documentos que ya no aplican se desactivan, los nuevos nacen en `PENDIENTE`, y lo
  subido que sigue aplicando se conserva.

### Paso 7 — Proceso visible

`User.procesoVisibleId`, actualizado en los tres momentos en que puede cambiar
(crear / finalizar / continuar).

Regla: **proceso visible = el `EN_PROCESO`; si no hay ninguno, el más reciente.**
El participante **nunca** ve procesos anteriores.

Propagar a: `find-all-user`, `find-one-user`, `find-all-staff`,
`export-participants-documents`, `get-status-funnel`, `find-participants-by-status`,
`export-funnel-participants`, `email-audience`.

`proceso.statusDocumental` es la fuente de verdad histórica; `User.status` se mantiene como
**espejo** del proceso activo, para no romper `email-audience` ni el dashboard funnel.

### Paso 8 — Frontend

- Página "Su proceso finalizó, ¿desea abrir uno nuevo?" con el botón que crea el proceso.
- Controles de USE: finalizar (masivo), continuar, nuevo proceso.

---

## 7. ⚠️ M5 — colapsar el apuntador doble: NO está en el alcance

El plan original junta esto con la Fase 2. **Se decidió separarlo** tras medir el riesgo real.

Hoy `UserDocuments` apunta *o* a `documentId` *o* a `documentSponsorId`. M5 unifica todo en
`documentId` y crea `@@unique([procesoId, documentId])`. Medición contra `testdocs` (2026-08-20):

```
Grupos (participante, documento) que colisionarían : 1001
  filas involucradas                               : 2013
  grupos con MÁS DE UNA fila activa                :   40
  grupos con MÁS DE UN archivo subido  ← clave     :   51
```

**Los 51 casos son el problema.** El participante tiene dos archivos subidos del mismo requisito
(uno por cada sponsor por el que pasó). Al colapsar, uno gana y el otro queda como histórico: el
archivo no se borra, pero **el participante deja de verlo**. Roza el requisito de §2.

**Los procesos funcionan sin esto.** Basta con agregar `procesoId` (paso 4). Eliminar
`documentSponsorId` es una limpieza aparte, a decidir con los 51 casos a la vista.

Script para volver a medirlo: el que se usó está descrito arriba; agrupa por
`(userId, COALESCE(ud.documentId, ds.document_id))` con `HAVING COUNT(*) > 1`.

---

## 8. Deuda abierta (no bloquea los procesos)

### 8.1 IDOR en `user-documents` — tarea 0.3 del plan, sin hacer

El `RolesGuard` **no** cierra esto: el rol es correcto, lo que falta es verificar que el recurso
sea del usuario.

| Endpoint | Problema |
|---|---|
| `GET /by-user/:userId` | Un participante puede pedir el expediente de **otro** |
| `POST /upload-file-document` | `userCreatedId` viene del **body**, debe salir del JWT |
| `POST /terminar-revision` | `participantId` y `createdById` vienen del body |

### 8.2 15 controllers sin control de rol

Solo `user-documents` está protegido. Sin proteger: `document` (10 endpoints), `user` (17),
`temporada` (7), `email-template` (7), `country`/`program`/`sponsor`/`etiqueta`/`role` (6 c/u),
`dashboard` (4), `option-program` (5), `auth` (3), `ai-query`, `email-action`, `mail-test`.

Hoy cualquier participante autenticado puede, por ejemplo, crear o borrar documentos del catálogo.

### 8.3 Otras (del plan original, Fase 0)

- **Secretos de Workuse commiteados** en `src/shared/workuse/workuse.service.ts:10-12`.
  Mover a `.env` + `env.schema.ts` y **rotar** con Workuse (están en git, considerarlos
  comprometidos).
- **`Person.dni` sin normalizar** y nullable. Requiere script de detección de colisiones **antes**
  del backfill: `dni` es `@unique` y `"01234567"` chocaría con `"1234567"`.
- **`RETIRADO` → `INACTIVO`** en `bulk-load-users.use-case.ts:24`; los otros dos caminos ya usan
  `INACTIVO`.
- **`console.log(data)`** en `autologin.use-case.ts:69` imprime datos personales en cada login.

### 8.4 Producción

- Producción **nunca se tocó**. Arrastra el mismo drift de migraciones.
- ⚠️ **No aplicar `add_user_documents_active_unique` sola** — reproduciría la caída de §4. Llevar
  esa migración junto con la que la revierte, o saltear ambas.
- Correr **siempre** `prisma/audit-perdida-datos.ts` y `prisma/censo-filas.ts` apuntando a
  producción antes de migrar. Los resultados limpios de `testdocs` **no** valen allá: dependen de
  los datos de cada base.

---

## 9. Herramientas disponibles

Scripts de solo lectura en `prisma/` (salvo donde se indique):

| Script | Para qué |
|---|---|
| `censo-filas.ts` | Cuenta filas de 12 tablas clave. `... censo-filas.ts antes` / `despues`, escribe `censo-<etiqueta>.json` |
| `audit-perdida-datos.ts` | Detecta si una consolidación haría perder a algún participante un archivo o un estado avanzado |
| `verify-user-documents-unique.ts` | Preexistente. Verifica la consolidación de duplicados de `UserDocuments` |
| `backup-database.ts` | Backup completo (schema + datos JSON) a `backups/` |

Comandos:

```bash
npx prisma migrate status                                   # migraciones pendientes
npx prisma migrate deploy                                   # aplicar (NUNCA "migrate dev" acá)
npx prisma migrate diff --from-config-datasource \
    --to-schema prisma/schema.prisma --script               # drift contra la base
npx tsc --noEmit -p tsconfig.json                           # typecheck
npx jest src/common src/modules/document --silent           # tests
```

⚠️ **`npm run prisma:migrate` está aliasado a `migrate dev`**, que ante una base con datos puede
proponer un **reset**. Usar siempre `migrate deploy`.

---

## 10. Convenciones del repositorio

- **Los archivos usan CRLF.** Editar con herramientas que lo preserven; `prisma format` los pasa a
  LF y hay que restaurarlos, o el diff muestra el archivo entero como modificado.
- **El lint no está limpio** y no es por este trabajo: `printWidth: 80` en `.prettierrc` contra
  código escrito a ~100 columnas (149 errores repartidos por todo el proyecto), y
  `react-hooks/set-state-in-effect` en todos los hooks del frontend. **No formatear archivos
  ajenos**: hace que el código nuevo destaque del que lo rodea e infla el diff.
- Arquitectura backend: Clean Architecture — `domain` → `application` → `infrastructure`.
- Guards: se registran **por módulo**, no globales.
- Los comentarios explican **por qué**, no qué. Ver los del schema y las migraciones como
  referencia de tono.
