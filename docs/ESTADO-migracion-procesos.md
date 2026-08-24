# Migración a Procesos — estado y continuación

> **Para retomar sin contexto previo.** Este documento se basta a sí mismo: dice qué está hecho,
> qué decisiones se tomaron y por qué, qué falta, y qué NO hay que hacer.
>
> **Última actualización:** 2026-08-24
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
| **2** | Tabla `procesos` + enum `ProcesoEstado` | ✅ Hecho |
| **3** | Backfill: un proceso por participante | ✅ Hecho (2970 procesos) |
| **4** | `UserDocuments.procesoId` | ✅ Hecho, `NOT NULL` incluido |
| **5** | Los cuatro casos de uso | ✅ Hechos los cuatro |
| **6** | Congelar proceso finalizado + limpiar el sync | ✅ Hecho |
| **7** | `User.procesoVisibleId` y propagarlo | ✅ Hecho |
| **8** | Frontend | ✅ Hecho |

**Los ocho pasos están hechos.** Lo que queda son las deudas de §8 y la decisión sobre M5 (§7),
ninguna de las cuales bloquea los procesos.

Estado de la base: `migrate status` → **up to date**, 38 migraciones, drift vacío.
`tsc` limpio en backend y frontend. 183 tests pasando (`src/common src/modules/document`
`src/modules/user-documents src/modules/proceso src/modules/user`, con `--runInBand`: ver §10). La
aplicación arranca y expone tres endpoints de proceso: `POST /api/procesos/finalizar`,
`POST /api/procesos/continuar` y `GET /api/procesos/participante/:id/historial`. Abrir un ciclo nuevo
**no tiene endpoint**: es automático. El frontend compila (`tsc -b`) y buildea.

---

## 2. Decisiones de negocio confirmadas por el cliente

Estas respuestas **modifican el plan original** y son las que valen:

1. **Finalizar un proceso** lo hace un usuario interno de USE — cualquiera que no sea
   `PARTICIPANTE`. Es decir: `ADMIN`, `SUPERVISOR`, `ASESOR`.

2. **Proceso finalizado + autologin: NO se bloquea el login.** El plan original decía
   "🚫 bloquea el login" — **eso quedó descartado**.

   El participante entra y ve una pantalla: *"Tu proceso finalizó"*, con un botón **"Abrir un nuevo
   proceso"** y el teléfono de USE como alternativa. El botón crea el ciclo, le arma el expediente y
   lo deja en su dashboard como siempre.

   ⚠️ **Historia de esta decisión, que conviene no repetir.** El 2026-08-24 se cambió a "automático,
   sin pantalla ni botón" y el 2026-08-25 se volvió atrás, porque automático **no funcionó**: la
   creación colgaba de `EnsureProcesoInicial`, al que llama la sincronización de documentos, y el
   sync corre desde siete caminos. Resultado medido en pruebas: **abrir el detalle de un ciclo
   finalizado desde el panel de USE le creaba al participante un ciclo nuevo.** Abrir un ciclo es una
   decisión, no un efecto secundario de mirar una pantalla.

3. **Se implementan las dos acciones de USE**, "Continuar" y "Finalizar":
   - *Continuar*: reabre el **mismo** registro conservando todo el avance. Es un
     "deshacer" para finalizaciones por error. Solo USE.
   - *Finalizar*: cierra el ciclo. Solo USE, y masivo.
   - *Nuevo proceso* ya no es una acción de nadie: es automático (§5.9).

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

### 5.3 Paso 3 — Backfill de procesos (M3)

Migración `20260824120000_backfill_procesos`. **2970 procesos** `EN_PROCESO`, uno por participante,
con `activo = 1`. Censo delta: `procesos` 0 → 2970 y **todo lo demás en 0**
(`prisma/censo-antes-m3.json` / `censo-despues-m3.json`). Es un `INSERT ... SELECT` puro: sin
`DELETE`, `UPDATE`, `DROP` ni `TRUNCATE`.

Precondiciones verificadas antes de aplicar, con `prisma/inspect-backfill-procesos.ts`:

| Chequeo | Resultado |
|---|---|
| Participantes | 2970 — eran ~2965 el 20-08, entraron 5 |
| Sin `programId` / `optionProgramId` / `countryId` | 0 |
| FK que apuntan a filas inexistentes | 0 |
| Con sponsor y `status_hired <> 1` | 0 |

Ese último cero es lo que justifica copiar `sponsorId` directo: da el mismo resultado que aplicar la
regla `status_hired === 1`. 1090 procesos quedaron sin sponsor (37%), como se esperaba.

Decisiones que quedaron dentro de la migración:

- **Entran también los 787 participantes en `INACTIVO`.** Los 2970 tienen filas en `UserDocuments` y
  el paso 4 pone `procesoId` en `NOT NULL`: excluir a alguien dejaría su expediente sin proceso al
  que colgarse. Su proceso nace `EN_PROCESO` con `statusDocumental = INACTIVO` — el estado
  documental y el ciclo de vida del proceso son dos cosas distintas.
- **`fechaIngreso` copia `User.created_at`**, lo más cercano a la verdad que hay en base para
  procesos retroactivos. El `createdAt` del proceso sí es el momento del backfill.
- **`temporadaId`** aplica la misma regla que usará el código (temporada activa del programa; la
  última creada si hay varias): 2969 procesos de WAT USA → `2026 - 2027`; el único de Internship USA
  → `NULL`, porque ese programa no tiene temporada.
- **`NOT EXISTS` contra `procesos`.** En producción el contenedor corre `migrate deploy` al arrancar;
  si algún participante ya tuviera proceso, es mejor saltearlo que voltear el deploy entero. Las
  columnas `NOT NULL` siguen fallando fuerte si entrara un participante sin programa, opción o país.

Comprobado después de aplicar con `prisma/dry-run-backfill-procesos.ts`: 2970 participantes
distintos, 0 desajustes contra `User` en programa / opción / país / sponsor / status / fecha
de ingreso, 0 procesos de no participantes, ids UUID v4 sin duplicados, y un segundo proceso abierto
para el mismo participante sigue siendo rechazado con `ER_DUP_ENTRY`.

### 5.4 Paso 4 — `UserDocuments.procesoId`: columna y backfill (M4)

Migración `20260824140000_add_user_documents_proceso`. Aditiva: `ADD COLUMN`, un `UPDATE` que solo
escribe la columna nueva, un índice y una FK `RESTRICT`. Censo delta **0 en todas las tablas**: no
se creó ni borró ninguna fila.

Las **25588** filas de `UserDocuments` quedaron con `proceso_id`: 0 nulos, 0 apuntando al proceso de
otro participante, y los 2970 procesos tienen expediente. Verificado con
`prisma/dry-run-user-documents-proceso.ts`, que evalúa la misma subconsulta antes y después de
aplicar — el `ALTER TABLE` no es transaccional en MariaDB, así que no se pudo ensayar y revertir
como se hizo con M3.

**A qué proceso se cuelga cada fila:** el abierto del participante y, si no hubiera ninguno, el más
reciente. Es la regla de "proceso visible" del paso 7, escrita una sola vez para que la base y el
código no puedan discrepar. Se usó una subconsulta correlacionada y no un `JOIN`: con un `JOIN`, un
participante con más de un proceso recibiría uno cualquiera sin aviso.

**El código ya llena la columna.** `resolveProcesoId` en
`user-documents.prisma.repository.ts` aplica la misma regla en los tres puntos que crean filas:
`createWithHistory`, `cloneDocumentForNewSponsor` y `upsertUserDocumentWithStatus`. Cubierto por 3
tests nuevos en el spec del repositorio (la consulta ordena por `activo` primero; sin proceso crea
con `null` y avisa; el clon hereda el proceso).

### 5.4.1 El `NOT NULL`, en una migración aparte

Migración `20260824170000_user_documents_proceso_not_null`. Se separó de la anterior porque el
`NOT NULL` **no era seguro hasta que existiera `EnsureProcesoInicial`** (§5.5):
`SyncUserDocumentsUseCase` le arma el expediente al participante en el mismo momento en que se lo
crea, y hasta entonces nada le garantizaba un proceso antes. Con la columna en `NOT NULL`, ese
primer sync habría fallado y el participante se habría quedado sin documentos.

La migración hace dos cosas:

1. Repite el mismo `UPDATE ... WHERE proceso_id IS NULL` — es idempotente a propósito, y barre las
   filas creadas mientras la columna admitía nulos. Acá actualizó 0.
2. `MODIFY proceso_id VARCHAR(36) NOT NULL`.

Si quedara alguna fila sin proceso, el `MODIFY` falla y la migración se detiene. Eso es lo deseado:
inventarle un proceso a una fila huérfana sería peor. Confirmado en base:
`UserDocuments.proceso_id` es `varchar(36) NOT NULL`, drift vacío.

`resolveProcesoId` ya no puede devolver `null`: si no hay proceso lanza `ConflictException` en vez
de escribir a medias. Con el sync abriéndolo antes, ese error solo puede salir de un camino que
cree documentos para un participante que todavía no debería tenerlos.

### 5.5 Paso 5 — `EnsureProcesoInicial`

Módulo nuevo `src/modules/proceso/`, con las tres capas del proyecto:

| Archivo | Contenido |
|---|---|
| `domain/proceso.entity.ts` | Entidad `Proceso` |
| `domain/proceso.repository.ts` | `IProcesoRepository`, `PROCESO_REPOSITORY`, interfaces de datos |
| `application/use-cases/ensure-proceso-inicial.use-case.ts` | El caso de uso |
| `application/use-cases/ensure-proceso-inicial.use-case.spec.ts` | 9 tests |
| `infrastructure/persistence/proceso.prisma.repository.ts` | Implementación |
| `infrastructure/persistence/proceso.mapper.ts` | `ProcesoMapper.toDomain` |

El repositorio se provee **también** en los tres módulos que proveen `SyncUserDocumentsUseCase`
—`auth`, `user` y `user-documents`— además de en `ProcesoModule`. Es el patrón del proyecto: los
repositorios se re-proveen por módulo en vez de exportarse (así se provee `DOCUMENT_REPOSITORY`).

**Dónde se invoca: dentro del sync, no en cada camino de alta.** El plan decía "autologin + batch",
pero los participantes también se crean por `bulk-load-users` y por el CRUD de usuarios, y esos
reciben documentos en su primer sync — quedarían sin proceso. `SyncUserDocumentsUseCase` es el
cuello único por el que pasan los siete caminos que arman un expediente, así que se llama ahí,
después del corte que ya existía por programa o país faltante:

```ts
const procesoId = await this.ensureProcesoInicial.execute(userId);
if (!procesoId) { /* warn y return: el expediente queda intacto */ }
```

Ese `return` es lo que hace seguro el `NOT NULL`: si no se le puede abrir proceso, **no se le crean
documentos**. Sigue el criterio que el sync ya tenía para el programa faltante — dejar el expediente
quieto es mejor que romperlo.

Decisiones del caso de uso:

- **No crea un segundo proceso.** Si ya hay uno (abierto o finalizado) lo devuelve y no toca nada.
  Abrir otro ciclo o reabrir son acciones explícitas de USE (`CrearNuevoProceso`,
  `ContinuarProceso`), no un efecto secundario de un login.
- **`statusDocumental` copia `User.status`**, no nace en `SIN_DOCUMENTOS`: el caso de uso también
  cubre al participante que ya existía sin proceso, y forzar `SIN_DOCUMENTOS` le borraría el avance
  del embudo.
- **`sponsorId` se toma de `User` tal cual.** La regla `status_hired === 1` ya la aplicó el upsert
  de Workuse; repetirla acá sería tener la misma regla en dos lugares.
- **Devuelve `null` sin crear nada** si el usuario no existe, si no es `PARTICIPANTE` (el staff no
  tiene proceso por diseño) o si le falta programa, opción o país — las tres columnas `NOT NULL` de
  `procesos`. Cada caso deja un `warn` que nombra el dato que falta.
- **Carrera resuelta en el repositorio:** dos sincronizaciones concurrentes del mismo participante
  pueden intentar abrirle el proceso a la vez; `uq_proceso_activo` deja pasar una, y la que pierde
  se queda con el proceso que creó la otra (mismo criterio que el sync ya usaba con P2002).
- **`estado` y `activo` se escriben solo en `crearProcesoAbierto`**, en un único lugar del
  repositorio — la decisión §2.5.

### 5.6 Paso 5 — `FinalizarProceso` y `ContinuarProceso`

Las dos acciones de USE sobre un proceso ya abierto, más el módulo con su controller.

| Archivo | Contenido |
|---|---|
| `application/use-cases/finalizar-proceso.use-case.ts` | Masivo, tolerante a fallos por DNI |
| `application/use-cases/continuar-proceso.use-case.ts` | Reabre el último finalizado |
| `application/use-cases/acciones-proceso.use-case.spec.ts` | 7 tests de los dos |
| `infrastructure/persistence/proceso.prisma.repository.spec.ts` | 5 tests del par `estado`/`activo` |
| `infrastructure/http/proceso.controller.ts` | `POST /finalizar`, `POST /continuar` |
| `infrastructure/http/dtos/` | DTOs de entrada y de respuesta |
| `proceso.module.ts` | Cablea el repositorio, los tres casos de uso y los dos guards |

**Ambos endpoints son `@Roles(...STAFF_ROLES)`** — `ADMIN`, `SUPERVISOR`, `ASESOR` (decisión §2.1).
El participante no puede finalizar ni reabrir, y de eso depende que no pueda abrir procesos en
cadena: para abrir otro tendría que cerrar el actual, y no puede.

#### ⛔ Se dirigen al **proceso**, no al participante

La primera versión recibía DNIs, como el resto de las acciones masivas, y cerraba "el ciclo abierto
de cada uno". **Con una fila por ciclo eso dejó de ser correcto**, y se vio en pruebas: con el
listado filtrado a `procesoEstado=FINALIZADO` aparecía una sola fila —el ciclo cerrado— y finalizar
cerraba **el ciclo abierto** de ese participante, que no estaba en la tabla.

Ahora los dos endpoints reciben ids de proceso: `{ procesoIds: string[] }` y `{ procesoId }`. **Lo
que se ve es lo que se cierra.** Finalizar un ciclo ya cerrado devuelve el error correspondiente en
vez de redirigirse a otro, y reabrir exige que *ese* ciclo esté finalizado.

El reporte sigue mostrando DNIs para que se entienda —`findProcesosParaAccion` los trae junto al
estado, en una consulta para todo el lote— pero la identidad de la acción es el proceso. El error
lleva los dos: `{ procesoId, dni, reason }`.

En el frontend, el listado manda `p.proceso.id` de cada fila. Antes filtraba por
`p.procesoVisible.estado`, que es el ciclo **visible** del participante y no el de la fila: ese era
el bug exacto. El resultado se muestra con `FinalizarProcesoResultDialog`, propio del módulo — dejó
de poder reusar el de documentos porque el error ya no es `{ dni, reason }`.

- **Finalizar es masivo y tolerante.** Un DNI que falla —no existe, o no tiene proceso abierto— se
  lista en `errors` y no detiene a los demás. Finalizar de a uno es el mismo endpoint con un solo
  DNI. Registra `finalizadoAt` y `finalizadoById` (el `sub` del JWT).
- **Continuar reabre el mismo registro**, con el avance intacto: los documentos no se tocan. Limpia
  `finalizadoAt` y `finalizadoById` — si la finalización fue un error, no debe quedar registrada
  como si hubiera ocurrido.
- **Continuar corta antes si ya hay un proceso abierto** (409) en vez de dejar salir el
  `ER_DUP_ENTRY` de `uq_proceso_activo`. La base sigue siendo el respaldo.
- **Ninguna de las dos toca documentos.** El expediente del proceso finalizado queda como registro
  histórico del ciclo; que el sync deje de tocarlo es el paso 6.

**El par `estado`/`activo` vive en un solo lugar**: dos constantes `ABIERTO` y `FINALIZADO` en el
repositorio, las únicas dos combinaciones válidas, usadas por los tres métodos que escriben
(`crearProcesoAbierto`, `finalizar`, `reabrir`). El test verifica explícitamente que `activo` nunca
sea `false` al finalizar: un solo `false` tiraría la garantía de unicidad, porque los `false` sí
colisionan en un índice único y los NULL no.

### 5.7 Paso 6 — El sync acotado al proceso, y congelado

Reescritura de `SyncUserDocumentsUseCase`. El archivo pasó de 206 a ~170 líneas y perdió toda la
maquinaria de herencia. Cubierto por **13 tests nuevos**
(`sync-user-documents.use-case.spec.ts`) — antes no tenía ninguno, y es el punto por el que pasan
los siete caminos que arman un expediente.

**Lo que hace ahora**, en orden:

1. Corta si falta programa o país (como antes).
2. `EnsureProcesoInicial` — que ahora devuelve el `Proceso` completo, no solo el id, porque el sync
   necesita el `estado`.
3. **Corta si el proceso está `FINALIZADO`.** Congelado: ni un documento nuevo en el catálogo ni un
   cambio de sponsor en Workuse lo mueven. Para que el participante vuelva a avanzar hace falta una
   acción explícita de USE.
4. Lee el expediente con **`findByProcesoId`**, no `findByUserId`. Un ciclo no ve los documentos de
   otro.
5. Crea en `PENDIENTE` lo que falta, alinea la vigencia de lo que ya está, y desactiva lo que dejó
   de aplicar. Nunca borra.

**Eliminado**, tal como pedía el plan: `cloneDocumentForNewSponsor`, `refreshDocumentFromLatest`,
`parentDocByLinkId`, el mapa `existingByParentDocId`, la heurística `bestRecord` y
`alreadyDeactivatedIds`. También se fueron del repositorio y de la interfaz de dominio, con sus
interfaces de datos. `findHistoryByUserAndTarget` **se conservó**: la usa
`sponsor-document-builder.service.ts`.

`createWithHistory` ahora **recibe** el `procesoId` en vez de resolverlo: el sync ya sabe en qué
proceso trabaja, y que el dato viaje explícito es lo que impide que un documento termine colgado del
proceso equivocado. El único camino que sigue resolviéndolo solo es
`upsertUserDocumentWithStatus` (carga masiva por nombre de archivo, que no pasa por el sync).

**Sobre los datos de hoy, el acotamiento al proceso es un no-op**: cada participante tiene
exactamente un proceso y sus 25588 filas apuntan a él, así que `findByProcesoId` devuelve el mismo
conjunto que devolvía `findByUserId`. Empieza a importar cuando exista el segundo proceso.

### ⚠️ 5.7.1 El hueco que deja: "lo subido que sigue aplicando se conserva"

El plan pide dos cosas que hoy no se pueden cumplir juntas. §6 manda **eliminar** la herencia, y
también dice que ante un cambio de sponsor con el proceso abierto "lo subido que sigue aplicando se
conserva". Sin la herencia, y mientras `UserDocuments` siga con el apuntador doble (§7), un documento
exigido por el sponsor viejo **y** por el nuevo son **dos filas distintas**: la vieja se desactiva, la
nueva nace en `PENDIENTE`, y el participante tendría que volver a subirlo.

Se eliminó igual, porque es lo que el plan manda, y porque el costo real medido es casi nulo
(`prisma/inspect-herencia-sponsor.ts`, 2026-08-24):

| | |
|---|---|
| Documentos del catálogo exigidos por más de un sponsor | **2** de 15 (uno por 4 sponsors, uno por 8) |
| Filas activas de sponsor con avance real (no `PENDIENTE`) | 81 de 6515 |
| **Filas que perderían el avance de vista ante un cambio de sponsor** | **5** |
| Participantes afectados | **5** |
| **De esas filas, con archivo subido** | **0** |

Es decir: en el peor caso, 5 participantes verían reiniciarse un **estado**, ninguno perdería un
**archivo**, y nada de eso ya ocurrió — es exposición ante un cambio futuro de sponsor. Los datos
siguen en base y las filas quedan inactivas, no borradas.

Cerrar el hueco de verdad requiere **M5** (colapsar el apuntador doble, §7): con un solo
`documentId` por documento, "el mismo documento bajo otro sponsor" deja de ser dos filas y se
conserva solo. Volver a medir con `inspect-herencia-sponsor.ts` antes de decidir.

### 5.8 Paso 7 — Proceso visible

Migración `20260824190000_add_user_proceso_visible`. Aditiva: `ADD COLUMN` + backfill + índice + FK
`RESTRICT`. **Censo delta 0.** Los 2970 participantes quedaron con `proceso_visible_id`, 0 nulos, 0
apuntando al proceso de otro, 0 apuntando a un proceso no abierto, y **0 usuarios de staff con la
columna puesta**.

Queda **nullable**, al contrario que `UserDocuments.proceso_id`: el staff de USE no tiene procesos.
Es la ausencia de un proceso, no un dato faltante.

**Por qué se guarda un puntero en vez de calcular la regla:** la regla —el abierto y, si no hay
ninguno, el más reciente— se puede calcular, pero los listados, los dos exports y el embudo la
necesitan para miles de participantes a la vez. El puntero evita una subconsulta por fila.

**Quién lo mantiene:** el repositorio de proceso, en los tres momentos del plan. `crearProcesoAbierto`
es el único que le cambia el valor de verdad; `finalizar` y `reabrir` lo reescriben igual —es
idempotente— a través de un helper común, de modo que si el puntero se hubiera desincronizado por
cualquier vía, la siguiente acción de USE lo corrige sola. Las tres van en transacción con la
escritura del proceso: el proceso y su puntero no pueden quedar en desacuerdo.

#### El espejo `User.status` ↔ `proceso.statusDocumental`

`proceso.statusDocumental` es la fuente de verdad histórica y `User.status` su espejo del proceso
activo. Sin el espejo, `statusDocumental` se quedaba congelado en el valor del backfill y la
afirmación "fuente de verdad histórica" era falsa.

Hay **tres** lugares que escriben `User.status`, y los tres ya lo hacían dentro de una transacción
junto con su fila de `UserHistoryStatus`:

| Lugar | Qué es |
|---|---|
| `user-status.prisma.ts` → `updateStatus` | El camino de los 7 llamadores documentales (`terminar-revision`, `upload-file-document`, `bulk-upload-by-filename`…) |
| `user.prisma.repository.ts` | La observación manual, que deja `OBSERVADO` / `OBSERVADO_SPONSOR` |
| `user.prisma.repository.ts` → `update` | El cambio de estado manual de USE (`change-user-status`) |

Los tres llaman a **`espejarStatusDocumental(tx, participanteId, status)`**, una función que recibe
la transacción en vez de ser un método de repositorio, justamente para entrar en la misma: si
quedara afuera, un fallo intermedio dejaría los dos valores en desacuerdo. Sin triggers de base de
datos (decisión §2.5).

El detalle que importa está en su `where`: **`{ participanteId, activo: true }`**. Un proceso
finalizado tiene `activo = null`, así que la consulta **no lo alcanza** — el ciclo cerrado queda
congelado sin necesidad de preguntar por su estado. Dos tests lo fijan, incluido uno que verifica
que el filtro no se relaje.

#### Lo que se propagó, y lo que no hizo falta

De los ocho lugares que el plan lista, **seis leen `User.*`** (incluido `status`) y no leen
documentos: `find-all-user`, `find-one-user`, `find-all-staff`, `get-status-funnel`,
`find-participants-by-status` y `export-funnel-participants`. Con el espejo mantenido siguen leyendo
lo mismo y **no requirieron ningún cambio** — que es exactamente para lo que el plan pedía el
espejo.

Los **dos que sí leen documentos** se acotaron, y con criterios distintos a propósito:

| Lectura | Alcance | Por qué |
|---|---|---|
| `findActiveStatusesByUserIds` (usada por `export-participants-documents`) | El **proceso visible**, aunque esté finalizado | El export debe mostrar el último estado conocido, no una fila vacía |
| `email-audience.findByDocumentStatus` | Solo procesos **abiertos** (`proceso: { activo: true }`) | Mandarle un correo a alguien por un documento de un ciclo cerrado sería pedirle que actúe sobre algo que no puede cambiar |

`email-audience.findByUserStatus` lee `User.status`: sigue funcionando por el espejo, sin cambios.

### 5.9 Paso 5 — `CrearNuevoProceso`, sin endpoint

**No tiene controller, ni DTO, ni pantalla, ni módulo administrable.** Es la corrección de §2.2: el
ciclo nuevo se abre solo.

**Dónde ocurre.** `EnsureProcesoInicial` —que ya era el punto único por el que un participante
obtiene un proceso, y que llama la sincronización— pasó de preguntar *"¿tiene algún proceso?"* a
preguntar *"¿tiene uno **abierto**?"*. Si no lo tiene, mira si tuvo alguno antes:

| Situación | Qué hace | `statusDocumental` |
|---|---|---|
| No tuvo ninguno | Le abre el primero | Copia `User.status`, para no perderle el lugar en el embudo |
| Tuvo, y USE lo cerró | `CrearNuevoProceso` le abre el siguiente | `SIN_DOCUMENTOS`, desde cero |

Como lo llama el sync, el disparador es el primer contacto del participante después del cierre: su
login, la consulta de su expediente, el batch nocturno o cualquiera de los siete caminos que
sincronizan. No hay nada que pulsar.

**Los datos salen del POST a Workuse**, como pedía el plan, pero sin una segunda llamada:
`autologin` e `info-participant` hacen el POST y actualizan al participante **antes** de sincronizar,
así que las dimensiones que se copian ya son las que Workuse acaba de reportar. Y si ese POST falla,
el camino se corta antes de llegar a crear nada — la condición "si falla, se aborta" se cumple por el
orden que ya existía.

**El estado del participante vuelve al inicial con el ciclo.** `crearProcesoDeNuevoCiclo` escribe, en
una sola transacción: el proceso nuevo, `User.procesoVisibleId`, `User.status = SIN_DOCUMENTOS` y su
fila de `UserHistoryStatus`. Si se separaran, el participante quedaría con un ciclo nuevo y el estado
del viejo — y el embudo mostraría un avance que ya no existe.

Los documentos **no** se crean acá: los crea la sincronización, que al encontrar el proceso nuevo
vacío da de alta todos los aplicables en `PENDIENTE`. Eso es lo que el paso 6 habilitó.

**El congelado del ciclo cerrado no se debilitó, se volvió estructural:** el sync lee y escribe solo
sobre las filas del proceso abierto, así que las del finalizado no están a su alcance. La rama que
chequeaba `estado === 'FINALIZADO'` quedó como red de seguridad —ya no debería alcanzarse— y su
comentario lo dice.

6 tests nuevos, incluidos los dos que impiden confundir los caminos: que el primer proceso copie
`User.status` y que el ciclo siguiente **no** lo copie aunque el participante viniera en
`APROBADO_SPONSOR`.

### 5.10 Paso 8 — Frontend

Dos controles de USE y nada más. **No hay pantalla para abrir un ciclo nuevo** porque no hay endpoint
que llamar (§2.2).

#### Backend: el proceso visible viaja en el listado

Para que la pantalla sepa qué acción ofrecer hacía falta un dato que no salía: `procesoVisible`
(`id`, `estado`, `fechaIngreso`) se agregó a `USER_INCLUDE` del mapper de usuario, con lo que
aparece en los tres includes —listado, detalle y básico— y en `UserResponseDto`. La entidad `User` lo
recibe como un campo más; el DTO es un cast de la entidad, así que no hubo mapeo manual que escribir.

Esta es la "propagación a los listados" que el paso 7 pedía y que entonces no hizo falta: sin este
dato la pantalla tendría que ofrecer las dos acciones siempre y dejar que el backend rechace la que
no aplica con un 409.

#### Frontend

| Archivo | Qué es |
|---|---|
| `core/domain/models/proceso.ts` | `ProcesoEstado`, `ProcesoVisible`, `FinalizarProcesoResult` |
| `infrastructure/repositories/proceso.repository.ts` | Las dos llamadas, con el mismo manejo de error que el resto |
| `features/proceso/hooks/useProcesoActions.ts` | `finalizar` y `continuar`, con sus toasts |
| `features/proceso/components/FinalizarProcesoDialog.tsx` | Alerta de confirmación masiva + resultado |
| `features/proceso/components/FinalizarProcesoButton.tsx` | Finalizar de a uno. Dos variantes: `icon` para la fila, `button` para el detalle |
| `features/proceso/components/ContinuarProcesoButton.tsx` | Botón + confirmación |
| `pages/Participant/index.tsx` | Ítem nuevo en el menú "Acciones" |
| `pages/Participant/ParticipantTable.tsx` | Botón de finalizar en la columna de acciones de cada fila |
| `pages/Participant/ParticipantDetailPage.tsx` | Botón "Continuar proceso" y el chip "Ciclo finalizado" |

Además, `procesoVisible` se sumó al modelo de participante, al tipo de la respuesta y al mapper.

**Finalizar** está en dos lados, y los dos usan el mismo endpoint — finalizar de a uno es la acción
masiva con un solo DNI, no una ruta aparte:

- **De a uno**, en dos lugares: la columna de acciones de cada fila del listado (variante `icon`) y
  la cabecera del detalle del participante (variante `button`, con etiqueta). Es **un solo
  componente** con dos variantes, como `EmailHistorySheet`: lo que no puede divergir es el texto de
  la advertencia, que es el único lugar donde se explica que el ciclo siguiente se abre solo.
  Aparece **solo si el ciclo del participante está abierto**: sobre uno finalizado no hay nada que
  cerrar y el backend lo devolvería como error. En el detalle queda junto a "Continuar proceso", y
  las dos son excluyentes por construcción — o el ciclo está abierto y se puede cerrar, o está
  cerrado y se puede reabrir.
- **Masivo**, en el menú "Acciones", siguiendo la convención de las otras acciones masivas: opera
  sobre los participantes de la página actual. Manda **solo los que tienen ciclo abierto**
  —filtrados con `procesoVisible.estado`— en vez de mandar todos y recibir errores uno por uno. El
  resultado se muestra con `BulkDocumentActionResultDialog`, que ya existía: la respuesta del backend
  tiene la misma forma que las demás acciones masivas, así que se reusa tal cual.

**Los dos van detrás de un `AlertDialog`**, el mismo componente que usa el borrado de documentos, no
un `Dialog` común: cerrar un ciclo no se deshace solo —hay que reabrirlo desde el detalle— así que
pregunta derecho *"¿Finalizar el proceso de …?"* y el botón de confirmar dice *"Sí, finalizar"*.

La alerta **dice qué pasa después**, porque no es evidente: el expediente queda archivado, y la
próxima vez que el participante ingrese se le abre un ciclo nuevo solo. Si alguien finaliza por
error, el mismo texto le dice dónde está el deshacer. Ninguna de las dos cierra el diálogo hasta que
la llamada termina, para que el botón pueda mostrar el spinner.

Con un solo DNI el aviso cambia: el backend devuelve el motivo por participante, y con uno solo ese
motivo —"no tiene un proceso abierto"— es lo único útil que se puede poner en un toast. Con varios no
cabe y el detalle va al diálogo de resultado.

**Continuar** vive en el detalle del participante y **aparece solo si su ciclo está `FINALIZADO`**.
Sobre uno abierto no hay nada que continuar y el backend responde 409; ofrecer el botón igual sería
ofrecer un error. Junto al botón, un chip "Ciclo finalizado" en la cabecera: sin él no habría forma
de saber por qué aparece esa acción.

Los mensajes de error salen del backend tal como llegan —el 409 explica mejor la situación que
cualquier texto genérico del frontend—.

### ⛔ 5.11 El fallo del segundo ciclo, y por qué faltaba

Encontrado probando con el DNI de prueba `12345678`: se le finalizó el ciclo, volvió a hacer
autologin, se le abrió el ciclo nuevo correctamente… y en su pantalla se veían **los documentos de
los dos ciclos**, además de que el estado saltaba de `SIN_DOCUMENTOS` a `OBSERVADO` solo.

**Lo que faltó:** el paso 6 acotó el **sync** al proceso, y el paso 7 acotó el export y
`email-audience`, pero **las lecturas del expediente seguían filtrando por `userId`**. Mientras cada
participante tuvo un solo proceso eso era equivalente; con el segundo, dejó de serlo.

Medido en base para ese participante:

```
documentos activos del ciclo EN_PROCESO  :  8   (0 con avance)
documentos activos del ciclo FINALIZADO  : 11   (6 con avance)
lo que veía la pantalla (por userId)     : 19
lo que ve ahora (por proceso visible)    :  8
```

#### Causa 1 — seis lecturas sin acotar

Todas en `user-documents.prisma.repository.ts`, ahora resueltas con un helper privado
`procesoVisibleId(userId)`; cuando no hay proceso visible, cada una **responde vacío, no "todo"**:

| Método | Qué rompía |
|---|---|
| `findByUserIdWithHistory` | El expediente que ve el participante y el que lee `TerminarRevision` |
| `countRequiredDocs` | Contaba los obligatorios de los dos ciclos |
| `hasObservedDocument` | Un `OBSERVADO` archivado movía el estado del ciclo nuevo |
| `findHistoryByUserAndTarget` | Historial del documento del ciclo equivocado |
| `findUserDocumentIdForTarget` | Una revisión masiva podía aterrizar en el expediente archivado |
| `upsertUserDocumentWithStatus` | Una carga por nombre de archivo podía actualizar la fila archivada |

Y en `document.prisma.repository.ts`, las **cuatro** escrituras que sincronizan `statusDocument` al
cambiar el catálogo llevan ahora `proceso: { activo: true }`: un cambio de catálogo no puede tocar un
ciclo congelado.

Cuatro tests nuevos lo fijan, incluido uno que exige que el `where` **no** tenga `userId`. Si alguna
de esas consultas vuelve a filtrar por usuario, el fallo vuelve sin que nada avise.

#### Causa 2 — la observación abierta del ciclo anterior

El `OBSERVADO` no venía de los documentos: venía de la **regla 0** de `TerminarRevision`, que manda a
`OBSERVADO` a cualquier participante con una observación vigente, sin mirar documentos. Ese
participante tenía dos observaciones de julio, del ciclo anterior, nunca cerradas.

Migración `20260824210000_add_user_observations_proceso`: `UserObservations.proceso_id`, con el
backfill asignando cada observación **al proceso que estaba vigente cuando se creó** (el de
`fecha_ingreso` más reciente que no sea posterior a `created_at`). Censo delta 0; las 26
observaciones resolvieron, ninguna quedó sin proceso ni asignada al de otro participante.

`hasActiveObservation` ahora filtra por el proceso visible, y una observación nueva nace en el ciclo
abierto. **Ninguna observación se cerró ni se ocultó**: cerrarlas para "limpiar" el ciclo habría
destruido algo que alguien escribió a mano. Siguen donde se levantaron, y dejan de opinar sobre un
ciclo que no es el suyo.

Con las dos causas resueltas: `hasActiveObservation` pasó de `true` a `false` y el expediente de 19
filas a 8, todas en `PENDIENTE` — que es la regla 2, `SIN_DOCUMENTOS`.

#### Lo que esto deja como lección

El patrón a revisar ante cualquier consulta nueva sobre `UserDocuments` o `UserObservations`: **si
filtra por `userId`, está mal**. El expediente pertenece a un proceso, no a una persona. Lo que sigue
por `userId` a propósito es `User.status` —que es el espejo del ciclo activo— y nada más.

### 5.12 Historial de procesos

Con más de un ciclo por participante hacía falta poder verlos. `GET /api/procesos/participante/:participanteId/historial`,
`@Roles(...STAFF_ROLES)`: **es información de USE**, el participante nunca ve sus procesos
anteriores.

Devuelve los ciclos del más reciente al más antiguo, y de cada uno: estado, `statusDocumental`, fecha
de ingreso, cuándo se finalizó y **quién** lo finalizó, sus dimensiones —programa, opción, país,
sponsor, temporada, que pueden diferir entre ciclos— y el resumen del expediente: cuántos documentos
vigentes tenía y cuántos con avance real. Ese último par es lo que permite distinguir un ciclo en el
que pasó algo de uno que quedó vacío.

Dos detalles de la consulta:

- Los conteos van en **un** `groupBy` por `(procesoId, status)` y no en un `_count` por fila: son dos
  números por ciclo y agrupar una vez evita una consulta por proceso.
- El nombre de quien finalizó se resuelve en una consulta aparte a `Person`, porque `Person` y `User`
  comparten el id pero **no tienen relación declarada** entre sí (es la deuda 3.1 del plan original),
  así que no se puede incluir.

En el frontend, `HistorialProcesosDialog` con las dos variantes de siempre —icono en la columna de
acciones del listado, botón con etiqueta en el detalle— y `HistorialProcesosCard` para cada ciclo. El
historial se carga **al abrir el diálogo**, no con el listado: traerlo para las cien filas de una
página serían cien consultas que nadie pidió.

### 5.13 El historial de correos, también por ciclo

Migración `20260824230000_add_email_log_proceso`. Mismo patrón que las observaciones: FK nullable,
backfill por fecha, y la lectura acotada. Censo delta 0.

**El problema:** el historial de correos se leía por participante, así que un ciclo nuevo nacía
mostrando los correos del anterior. En el caso de prueba eran 5 correos, todos del primer ciclo, que
aparecían en un ciclo recién abierto. Ahora ese ciclo muestra **0**.

**La escritura tiene un solo cuello.** Hay siete lugares que registran correos —tres en
`email-dispatch.service.ts`, cuatro en `email-schedule.service.ts`— y **ninguno se tocó**: el
`procesoId` se resuelve dentro de `EmailLogPrismaRepository.create` a partir del `recipientUserId`.
Es el mismo criterio que `espejarStatusDocumental`: la regla vive en un solo lugar y los puntos de
envío no necesitan saber de procesos.

Se usa el proceso **visible** del destinatario, no el abierto, porque es exactamente el mismo con el
que se filtra al mostrar: así un correo registrado ahora se ve ahora, incluso en la ventana entre
finalizar un ciclo y que el participante vuelva.

**La lectura** se filtra en `mapEmailLogs` y no en el `include`, porque Prisma no puede comparar un
include contra una columna de la fila padre. **El frontend no necesitó ningún cambio**: el historial
ya venía dentro del participante.

Nullable por dos razones reales: los registros a nivel de plantilla (un `OMITIDO` cuando la plantilla
no tiene audiencia) no tienen destinatario y por lo tanto no tienen ciclo, y el destinatario podría no
ser participante. Un correo sin proceso no aparece en el historial de nadie — que es donde estaba
antes también, porque sin `recipientUserId` nunca se mostró.

4 tests nuevos en `user.mapper.spec.ts`, incluido el que fija que **sin proceso visible no se muestra
nada, en vez de mostrarlo todo**.

Un caso vecino que **sí** conviene dejar como está: `User.fechadeenvioalsponsor`, que alimenta
`hasBeenSentToSponsor`. Workuse la reescribe en cada upsert, así que refleja la realidad actual y no
el ciclo viejo.

### 5.14 Un ciclo nuevo arranca limpio: el cierre del patrón

Migración `20260825000000_add_user_history_status_proceso`, más el filtro de las observaciones en la
lectura. Con esto **las cuatro cosas** que forman el expediente de un participante pertenecen a un
ciclo: documentos, historial de estados, observaciones y correos. Censo delta 0. **Nada se borra**:
todo sigue colgado del ciclo donde ocurrió.

Resultado en el caso de prueba, para el ciclo recién abierto:

| | Antes | Ahora |
|---|---|---|
| Historial de estados | 168 | **2** (las suyas) |
| Observaciones | 6 | **0** |
| Correos | 5 | **0** |
| Documentos | 19 | **8** (los suyos) |

#### `UserHistoryStatus`: ocho puntos de escritura, una sola regla

A diferencia de los correos, acá **no había un cuello único**: hay ocho lugares que escriben
historial de estados, repartidos entre `autologin`, `user`, `user-documents` y `proceso`. La regla se
puso en un helper —`procesoVisibleDe(tx, userId)`— que recibe la transacción, y cada sitio lo llama.
125 631 filas backfilleadas, 0 sin proceso, 0 asignadas al proceso de otro.

**El caso del alta, que es el interesante.** Dos de esos ocho sitios escriben la primera entrada de
historial de un participante que **se está creando**: su proceso todavía no existe, porque lo abre el
sync más adelante en la misma llamada. Esas entradas nacen sin ciclo, y el filtro del mapper descarta
lo que no tiene ciclo — habrían quedado invisibles.

Se resolvió donde corresponde: **`crearProcesoAbierto` adopta las entradas huérfanas** del
participante al abrir su primer proceso, en la misma transacción. Es correcto solo ahí:
`crearProcesoDeNuevoCiclo` **no** adopta, porque una huérfana en un ciclo posterior pertenecería al
primero. Los dos comportamientos tienen su test.

**`findLastStatusBeforeInactive`** también se acotó. Restaura el estado previo al reactivar a un
participante; en un ciclo nuevo no hay nada que restaurar, y devolver el estado de un ciclo anterior
le daría un avance que no tiene. Con `null`, quien llama recalcula por documentos.

#### Las observaciones, ahora también en la lectura

Cuando se acotó `hasActiveObservation` (§5.11) se dejó a propósito que el listado de observaciones
siguiera mostrando todas. Se decidió cerrarlo: ahora el mapper las filtra por ciclo visible, igual
que el historial y los correos. Las dos usan el mismo helper `historialDelCiclo`.

#### El patrón, para lo que venga

Cuatro tablas, cuatro veces la misma forma:

1. FK `procesoId` **nullable** a `procesos`, `ON DELETE RESTRICT`, con índice.
2. Backfill por fecha: el proceso vigente cuando ocurrió el registro.
3. La escritura resuelve el proceso en **un** lugar, no en cada punto de uso.
4. La lectura filtra por proceso visible y, sin proceso visible, **responde vacío en vez de todo**.

Lo que **no** se hace: cerrar, borrar ni editar los registros del ciclo anterior. Un ciclo nuevo
arranca limpio porque deja de mirarlos, no porque desaparezcan.

### 5.15 El listado por ciclo, y el detalle de un ciclo archivado

Con varios ciclos por participante, la tabla dejó de tener sentido como "una fila por persona".
Ahora es **una fila por proceso**: quien tuvo dos ciclos aparece dos veces, cada vez con el suyo.

#### El listado

Método nuevo `findAllByProceso`, **separado de `findAll`**: el dashboard usa `findAll` para contar
participantes por estado, y ahí una persona con dos ciclos contaría doble. Consulta sobre `procesos`
con el participante incluido, paginando y contando sobre filas de proceso.

**Los filtros se reparten según a quién pertenece el dato** (decisión del 2026-08-25):

| Filtro | Se aplica a |
|---|---|
| **Estado del proceso** (`procesoEstado`: `EN_PROCESO` / `FINALIZADO`) | **El ciclo de la fila** |
| Estado documental, sponsor, programa, opción, país | **El ciclo de la fila** |
| Búsqueda por nombre o DNI, solicitud de retiro, fecha de envío al sponsor, rango de fechas | El participante |

`procesoEstado` es el filtro propio del listado por ciclo: sin él se ven todas las filas, con
`EN_PROCESO` solo los ciclos abiertos y con `FINALIZADO` solo los cerrados. Vive en `UserFilters` pero
**solo lo usa `findAllByProceso`** — en `findAll`, donde una fila es una persona, no tendría sentido:
alguien con dos ciclos no tiene un único estado de ciclo.

En el frontend es el select "Proceso" de la barra de filtros, y como los demás viaja en la URL, así
que un filtro aplicado se puede compartir por link.

Es decir: filtrar "sponsor = CIEE" devuelve los ciclos cuyo sponsor **fue** CIEE, no los
participantes que hoy lo tienen. Coherente con una tabla por ciclo, y es un cambio de resultados
respecto del listado anterior.

Orden por defecto: la antigüedad del participante que ya tenía el listado, y los ciclos de cada uno
quedan juntos con el más reciente arriba. El orden por nombre sigue resolviéndose en memoria —
`firstname`/`lastfathername` viven en `Person`, sin relación Prisma— pero ahora sobre filas de
proceso.

**La fila trae su ciclo.** `User.proceso` (`id`, `estado`, `statusDocumental`, `fechaIngreso`,
`finalizadoAt`, `esVisible`) va **al final** del constructor de la entidad: son 29 argumentos
posicionales y meter uno en medio desalinea todo lo que sigue — pasó al primer intento.

Y lo que cuelga del ciclo se filtra por **el de la fila**, no por el visible: la fila de un ciclo
archivado muestra su historial, sus observaciones y sus correos, no los del ciclo en curso.

#### La tabla

- Columna nueva **"Proceso"**: "En proceso" / "Finalizado", con un punto de color —anillado en el
  ciclo abierto— en vez de texto suelto. Es distinta de la columna "Estado", que es el avance
  documental: una dice si el ciclo está abierto, la otra en qué anda el expediente.

  Un primer intento marcaba con *actual* el ciclo abierto que además era el visible. **Es
  redundante**: solo puede haber un ciclo abierto y la regla del proceso visible siempre lo elige a
  él, así que todo ciclo abierto es el visible. La marca informa en el caso inverso — un ciclo
  **finalizado** que sigue siendo el visible significa que el participante no volvió a entrar, y por
  eso ve un ciclo cerrado. Eso se señala con un ojo y su tooltip.

  El chip vive en `features/proceso/components/ProcesoBadge.tsx` y **lo comparten el listado y la
  cabecera del detalle** (con `size="md"` allá). Estaba local en la tabla; se extrajo al necesitarlo
  en los dos lugares, porque dos copias son dos diseños que tarde o temprano se separan. En el
  detalle reemplazó al texto suelto "Ciclo finalizado", que además solo aparecía cuando estaba
  cerrado — ahora se ve el estado en los dos casos.

  Para que el detalle pueda mostrarlo siempre, `findById` devuelve el ciclo visible cuando no se pidió
  uno por URL (helper `cicloDelDetalle`), y el select de `procesoVisible` en el mapper se amplió con
  `statusDocumental` y `finalizadoAt`.

#### ⛔ El constructor de `User` tiene 29 argumentos posicionales

Se desalineó **dos veces** con el mismo campo:

1. Al agregar `proceso` en medio del constructor, corriendo todo lo que venía después. Se movió al
   final.
2. `toDetailDomain` se quedó **sin pasarlo**, así que el chip del detalle mostraba `—` en vez del
   estado del ciclo. Sus correos además seguían filtrándose por el ciclo visible y no por el pedido.

Los dos fallos son silenciosos: compilan, no lanzan, y solo se ven en la pantalla. Hay 3 tests en
`user.mapper.spec.ts` que fijan que `proceso` llegue en su posición en los dos mapeos, y que el
listado no traiga observaciones —si aparecieran, algo se corrió—. **Antes de tocar ese constructor,
correr esos tests.**
- La columna "Estado" ahora muestra el `statusDocumental` **del ciclo de la fila**.
- Finalizar aparece solo en filas con el ciclo abierto.
- **Se quitó el botón de historial de procesos**, junto con sus componentes: con una fila por ciclo,
  la tabla *es* el historial. El endpoint `GET /procesos/participante/:id/historial` **queda
  disponible** —trae además el conteo de documentos por ciclo y quién lo finalizó— pero ya no lo
  consume nadie.

#### El detalle de un ciclo archivado

Entrar desde la fila de un ciclo finalizado abre `/participant/:id?proceso=<id>` y el detalle se pone
en **solo lectura**: muestra los documentos, observaciones, correos e historial de *ese* ciclo, con un
aviso arriba y **sin ninguna acción**. Un ciclo cerrado está congelado.

Dos detalles que importan:

- **El `procesoId` viene de la URL**, así que las dos consultas que lo aceptan
  —`findById` y `findByUserIdWithHistory`— lo validan contra el participante
  (`where: { id, participanteId }`). Sin esa condición se podría mirar el ciclo de otra persona
  cambiando un id en la barra de direcciones.
- **Con `procesoId` no se sincroniza.** `FindUserDocuments` se saltea el sync: trabaja siempre sobre
  el ciclo abierto, y correrlo mientras se mira uno archivado no tendría sentido.
- ⚠️ **El `procesoId` va declarado en el DTO de la query**, no como `@Query('procesoId')` suelto. El
  `ValidationPipe` global corre con `forbidNonWhitelisted`, así que una propiedad que no esté en
  `FindUserDocumentsQueryDto` tumba **toda** la consulta con
  `"property procesoId should not exist"` — un 400 que no dice nada del problema real. Pasó y costó
  un rato. En `/users/:id` no hace falta porque ahí el parámetro no se enlaza a una clase.

#### Un ciclo archivado se ve completo, pero no se toca

El requisito es ver **todo** del ciclo cerrado —documentos, historial, archivos— y no poder modificar
nada. Dos filtraciones que había que cerrar, las dos por el mismo motivo: `participant.status` es el
espejo del ciclo **activo**, no del que se está mirando.

| Dónde | Qué mostraba | Ahora |
|---|---|---|
| El chip de estado de la cabecera | El avance del ciclo en curso | `proceso.statusDocumental` del ciclo mirado |
| Las acciones de cada documento | Se habilitaban con `participantStatus === 'EN_REVISION'`, tomado del ciclo activo | Reciben el estado del ciclo mirado **y** un `soloLectura` explícito |

El `soloLectura` se chequea **aparte** del estado a propósito: un ciclo archivado no admite acciones
aunque hubiera quedado en `EN_REVISION`. Son 5 banderas de acción y las cinco lo llevan.

### ⛔ 5.16 El ciclo que se creaba solo, y la vuelta al botón

Encontrado probando: se finalizó el ciclo del DNI de prueba, se entró al detalle del ciclo
archivado, y **se creó un ciclo nuevo sin que nadie lo pidiera**. Verificado en base: el proceso
espurio se creó a las 01:46, el mismo minuto en que se abrió la pantalla.

**La causa.** `EnsureProcesoInicial` abría el ciclo siguiente cuando el participante no tenía ninguno
abierto. A ese caso de uso lo llama `SyncUserDocumentsUseCase`, y el sync corre desde **siete
caminos** — autologin, info del participante, carga masiva y los listados que sincronizan al vuelo.
Con solo mirar a un participante con el ciclo cerrado, se le abría el siguiente.

#### Lo que se revirtió

`EnsureProcesoInicial` volvió a hacer una sola cosa: **crear el primer proceso si no hay ninguno**.
Cuando el participante tiene solo ciclos cerrados devuelve el más reciente sin crear nada, y el sync
—que ya tenía el corte por `FINALIZADO`— no toca el expediente. Ese corte, que había quedado como red
de seguridad, volvió a ser el camino real.

#### La acción explícita

`CrearNuevoProceso` pasó a tener su propio endpoint: **`POST /api/procesos/mio/nuevo`**,
`@Roles(PARTICIPANTE)`. No recibe a quién — el participante sale del JWT, así que no hay forma de
abrirle un proceso a otro. Verifica que no tenga uno en curso, crea el ciclo y **sincroniza en el
mismo movimiento**, para que el participante encuentre su expediente ya armado.

En el frontend, `ProcesoFinalizadoAviso`: el dashboard del participante detecta
`proceso.estado === 'FINALIZADO'` y, en vez de su expediente, muestra el aviso con el botón y el
teléfono de USE. Al abrir el ciclo recarga y sigue como siempre.

⚠️ El teléfono es **provisional** (`TELEFONO_USE` en ese archivo): reemplazarlo por el real.

Para que el participante lo sepa, `AuthUser.proceso` viaja en `/users/:id` — que ya devolvía el ciclo
desde §5.15— y se mapea en `dashboard.repository.ts`.

6 tests nuevos en `crear-nuevo-proceso.use-case.spec.ts` y uno en el de `EnsureProcesoInicial` que
**fija que no abra el ciclo siguiente**. Ese es el que impide que esto vuelva.

#### El dato espurio

El ciclo que el bug creó se eliminó con respaldo en `backups/limpiar-proceso-espurio.json`: 8
documentos y 8 historiales, **ninguno con archivo subido** —el script aborta si encuentra uno— más 1
entrada de estado. El participante quedó con su ciclo `FINALIZADO` en `OBSERVADO_SPONSOR`, sus 11
documentos y sus 75 historiales con archivo intactos.

### 5.17 Trabajo previo relacionado

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

### Paso 5 — Los cuatro casos de uso: hechos

| Caso de uso | Quién | Estado |
|---|---|---|
| `EnsureProcesoInicial` | El sync | ✅ §5.5 |
| `FinalizarProceso` | Solo USE, masivo | ✅ §5.6 |
| `ContinuarProceso` | Solo USE | ✅ §5.6 |
| `CrearNuevoProceso` | **Nadie: automático** | ✅ §5.9 |

### Paso 8 — Frontend

✅ Hecho, §5.10. La página "¿desea abrir uno nuevo?" del plan original **no se construyó** y no debe
construirse: abrir el ciclo nuevo es automático (§2.2).

---

**No queda nada del plan de procesos por hacer.** Lo que sigue son las deudas de §8 —el IDOR de
`user-documents`, los 15 controllers sin control de rol, los secretos de Workuse— y la decisión sobre
M5 (§7). Ninguna bloquea los procesos, y las de §8 son anteriores a este trabajo.

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

Lo que sí cambió: **M5 es ahora también la forma de cerrar el hueco de §5.7.1**. Mientras el
apuntador siga doble, el mismo documento bajo otro sponsor son dos filas y un cambio de sponsor
reinicia el avance. Hoy eso afecta a 5 participantes y a ningún archivo, así que no es urgente —
pero es el argumento a favor de M5 que antes no existía.

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
| `censo-filas.ts` | 14 conteos de tablas clave, `procesos` incluida. `... censo-filas.ts antes` / `despues`, escribe `censo-<etiqueta>.json` |
| `inspect-backfill-procesos.ts` | Precondiciones del backfill: NULLs, FK huérfanas, sponsors, temporadas, distribución de status |
| `dry-run-backfill-procesos.ts` | Corre el SQL de M3 en una transacción y hace rollback. Después de aplicar, sirve de verificación |
| `inspect-backfill-user-documents-proceso.ts` | Precondiciones de M4: tipos de columna, cobertura, ambigüedad, apuntador doble |
| `dry-run-user-documents-proceso.ts` | Evalúa en SELECT la resolución de proceso de M4. Sirve antes y después de aplicar |
| `inspect-backfill-user-documents-proceso.ts` | Corrido después del `NOT NULL`, confirma el tipo de columna y que no queden nulos |
| `inspect-herencia-sponsor.ts` | Mide la exposición del hueco de §5.7.1: cuántos participantes reiniciarían avance ante un cambio de sponsor |
| `inspect-observaciones-proceso.ts` | Alcance de acotar `UserObservations` al proceso: activas, participantes afectados, resolución del backfill |
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
- **`bulk-extract-passport-data.use-case.spec.ts` falla de forma intermitente en paralelo** — tiene
  temporizadores de reintento y jest fuerza la salida del worker. Aislada pasa 9/9. Correr la suite
  con `--runInBand`. No es de este trabajo.
