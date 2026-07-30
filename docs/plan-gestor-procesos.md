# Gestor de documentos — Migración a modelo de Procesos

> **Estado:** análisis cerrado, pendiente de ejecución. Ningún cambio de código aplicado.
> **Fecha:** 2026-07-30
> **Origen:** `gestor_docs_para_dev.pdf` (Universal Student Exchange) + auditoría del backend actual.

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Mapeo documento ↔ esquema actual](#2-mapeo-documento--esquema-actual)
3. [Hallazgos](#3-hallazgos)
4. [Decisiones de negocio confirmadas](#4-decisiones-de-negocio-confirmadas)
5. [Esquema objetivo](#5-esquema-objetivo)
6. [Plan de ejecución por fases](#6-plan-de-ejecución-por-fases)
7. [Fase 0 — tareas detalladas](#7-fase-0--tareas-detalladas)
8. [Riesgos de migración de datos](#8-riesgos-de-migración-de-datos)
9. [Preguntas abiertas](#9-preguntas-abiertas)

---

## 1. Resumen ejecutivo

El catálogo de requisitos del backend actual está **más desarrollado** que el que propone el PDF (tiene tipos de documento, siglas, orden, instrucciones, descripciones por programa y país, historial completo con etiquetas y archivos de observación).

Falta la pieza sobre la que se apoya todo el documento: **no existe la entidad `proceso`**. Hoy el expediente cuelga del `User`, y los ~170 de `SyncUserDocumentsUseCase` que clonan y heredan documentos entre sponsors son el síntoma directo de esa ausencia.

**La regla del PDF que no se rompe nunca:** cada documento apunta a un proceso, jamás directamente a la persona.

### Qué se gana con la migración

| Antes | Después |
|---|---|
| Un participante que vuelve pisa su propia fila y hereda documentos del año anterior | Cada participación es un expediente independiente |
| Herencia de archivos entre sponsors vía heurística de `bestRecord` | Sin herencia — se elimina el código completo |
| Apuntador doble (`documentId` / `documentSponsorId`) + 2 índices únicos | Un solo `requisitoId` + un unique |
| Filtrado solo por sponsor | 4 dimensiones: programa, opción, país, sponsor |
| Expediente cerrado alterable por cambios de catálogo | Congelado de verdad |

---

## 2. Mapeo documento ↔ esquema actual

| PDF | Esquema actual | Estado |
|---|---|---|
| `programa` | `Program` (+`code`, `idExterno`) | ✅ Superior |
| `opcion` | `OptionProgram` (`shortDatabase`, `programId`) | ⚠️ Sin nombre legible |
| `sponsor` | `Sponsor` (+`code`, `idExterno`) | ✅ Superior |
| `participante` | `Person` + `User` (mismo `id`, **sin FK**) | ⚠️ `dni` nullable y sin normalizar |
| **`proceso`** | **— aplanado en `User`** | ❌ **No existe (crítico)** |
| `requisito_documental` | `documents` (+`type`, `siglasCode`, `order`, `instructions`, `formats`) | ✅ Superior |
| `requisito_programa` | `DocumentProgram` | ⚠️ Existe pero **no filtra** |
| `requisito_opcion` | — | ❌ No existe |
| `requisito_pais` | `DocumentProgramDescriptionCountry` | ⚠️ Semántica distinta |
| `requisito_sponsor` | `DocumentSponsor` (+`required` override, `order`) | ✅ Idéntico al PDF |
| `documento` (subido) | `UserDocuments` + `UserDocumentHistory` | ⚠️ Cuelga de `userId`, no de proceso |

### Estados del documento subido

El enum actual es un **superconjunto** del PDF. No requiere cambios, solo fijar vocabulario:

| PDF | Actual |
|---|---|
| pendiente | `PENDIENTE` |
| — | `SUBIDO` |
| en revisión | `EN_REVISION` |
| observado | `OBSERVADO` |
| aprobado | `REVISADO` |

---

## 3. Hallazgos

### 🔴 H1 — No hay `proceso`: dos participaciones comparten la misma fila

`bulk-info-participants.use-case.ts:271` llama `upsertByDni(...)` y **sobrescribe** `programId`, `optionProgramId`, `sponsorId` y `countryId` en la misma fila `User`. Acto seguido (`:296`) corre el sync, que vía la heurística de `bestRecord` (`sync-user-documents.use-case.ts:79`) **hereda al expediente nuevo los archivos del anterior** mediante `cloneDocumentForNewSponsor`.

Es exactamente lo que el PDF prohíbe. Hoy no se manifiesta porque solo se cargan participantes de Perú + WAT USA de un ciclo (`bulk-info-participants.use-case.ts:17-20`), pero es un bug latente, no una hipótesis.

### 🔴 H2 — El filtrado real solo mira sponsor

`document.prisma.repository.ts:128` — `findBySponsorCode()` es lo único que decide qué documentos se piden, y solo cruza sponsor:

```ts
OR: [
  { documentSponsors: { some: { sponsor: { code: sponsorCode }, status: true } } },
  { documentSponsors: { none: { status: true } } },   // regla "sin filas = todos" ✅
]
```

`DocumentProgram` **no aparece en ninguna query del flujo del participante** (verificado con grep sobre `user-documents/` y `user/`: cero resultados).

**Consecuencia:** un documento configurado solo para Internship hoy se le pide igual a los de WAT USA. Se rompe el día que entre un segundo programa.

Lo bueno: la regla "sin filas = aplica a todos" ya está bien implementada para sponsor. Solo hay que replicar el patrón.

### 🔴 H3 — No existe control de autorización por rol

El proyecto **no tiene `RolesGuard` ni decorador `@Roles`**. `src/common/guards/` contiene únicamente `jwt-auth.guard.ts`, y `UserDocumentsController` se protege solo con `@UseGuards(JwtAuthGuard)` (`user-documents.controller.ts:73`).

Cualquier usuario autenticado —**incluido un participante**— puede llamar:

- `POST /user-documents/aceptar-document` → **aprobar sus propios documentos**
- `POST /user-documents/bulk-aceptar-document` → aprobar en masa
- `GET /user-documents/by-user/:userId` → leer el expediente de cualquier otro
- `POST /user-documents/terminar-revision` → forzar recálculo de estado

Además es **prerequisito de la Fase 2**: finalizar / continuar / crear proceso son acciones exclusivas de USE y no hay forma de restringirlas sin este guard.

### 🟠 H4 — IDOR: el cliente decide de quién es el expediente

Ningún endpoint valida que el recurso pertenezca al usuario del JWT:

| Endpoint | Problema |
|---|---|
| `GET /by-user/:userId` (`:112`) | `userId` del path, sin verificar contra `JWT.sub` |
| `POST /upload-file-document` (`:336`) | `userDocumentId` **y `userCreatedId`** vienen del body |
| `POST /terminar-revision` (`:368`) | `participantId` y `createdById` del body |

El `UploadFileDocumentDto` pide literalmente el UUID del creador al cliente:

```ts
export class UploadFileDocumentDto {
  @IsUUID() userDocumentId!: string;
  @IsUUID() userCreatedId!: string;   // ← debe salir del JWT
}
```

El PDF lo advierte textualmente: *"el proceso_id se resuelve siempre en el backend a partir de la sesión — nunca se acepta desde el navegador"*.

### 🟠 H5 — `requisito_pais` no se puede derivar de las descripciones

`DocumentProgramDescriptionCountry` cuelga de una **descripción** dentro de un **programa**. Sirve para "a los de Perú muéstrales esta instrucción". No es "este documento solo se pide en Perú". Tres razones por las que no se puede reutilizar como filtro:

1. **Editar un texto cambiaría las reglas de negocio.** Con la regla "sin filas = todos los países", agregar una descripción para Perú haría que el documento **deje de pedirse en el resto de países**, en silencio.
2. **Obliga a inventar contenido.** `title` y `description` son NOT NULL: expresar aplicabilidad exigiría redactar textos que nadie quiere.
3. **Bloqueo estructural.** `documentProgramId` es NOT NULL, así que un documento que aplica a **todos los programas** (sin filas en `document_programs`) pero solo en **Perú** es **inexpresable**. Y hoy la mayoría de documentos son generales, así que el caso es el mayoritario, no el borde.

**Decisión:** `DocumentProgram`, `DocumentProgramDescription` y `DocumentProgramDescriptionCountry` se dejan **intactos**. Resuelven bien un problema distinto y valioso.

| Concepto | Tabla | Pregunta que responde |
|---|---|---|
| ¿A quién se le pide? | `document_countries` (nueva) | "¿Perú debe subir esto?" |
| ¿Cómo se lo explico? | `document_program_description_countries` (actual) | "¿Qué texto ve un peruano en WAT?" |

> Se evaluó una tabla polimórfica única (`document_scopes(documentId, dimension, valueId)`) para unificar las 4 dimensiones. **Descartada:** pierde las FKs reales y `document_programs` / `document_sponsors` ya están poblados y funcionando.

### 🟠 H6 — El apuntador doble de `UserDocuments` es la deuda central

`UserDocuments` apunta **o** a `documentId` **o** a `documentSponsorId`. De ahí salen los dos `@@unique` añadidos el 2026-07-30, el mapa `parentDocByLinkId`, el clonado entre sponsors y el riesgo de duplicados que ya se materializó (commit `3d196a6`).

Nota sobre los unique actuales: `[userId, documentSponsorId, statusDocument]` incluye `statusDocument` como columna, así que solo admite **un** histórico desactivado por par. Hoy no colisiona porque cada clon usa un vínculo distinto, pero es una garantía frágil.

**Objetivo:** el documento subido apunta **siempre a `documentId` (el requisito)**. El sponsor vive en el proceso; `document_sponsors` queda como pura configuración (aplicabilidad + override de obligatoriedad).

### 🟠 H7 — Congelar el expediente no está implementado

`STATUSES_LOCKED_FROM_DOCUMENT_SYNC` (`bulk-info-participants.use-case.ts:43`, `autologin.use-case.ts:23`) **solo** bloquea el recálculo del status del participante. **No** impide que el sync agregue o desactive documentos.

Hoy, si el admin desactiva un requisito, también se desactiva en el expediente de alguien que ya está `DS2019_EMITIDO`. El PDF pide explícitamente que eso no pase.

### 🟡 H8 — Secreto de la API externa commiteado en el repositorio

```ts
// src/shared/workuse/workuse.service.ts:10-12
const WORKUSE_API_KEY = 'nexsys-01-app';
const WORKUSE_API_SECRET = 'f8c2e131e76d7c4f37b24a6fdd2b83c3c252740268de5f83b0c80abc1330b';
```

Está en git. Debe moverse a `.env` + `env.schema.ts`, y el secreto debe **rotarse con Workuse** (ya está comprometido).

### 🟡 H9 — Otros

- **`Person.dni` es nullable y sin normalizar.** `existsByDni()` compara el valor crudo de Workuse. El PDF: *"si entra sucio, ese cruce [con el CRM] falla sin avisar"*.
- **`Temporada` está huérfana.** Existe ligada a `Program`, pero **nadie la referencia** — no hay `temporadaId` en ningún modelo.
- **`Person`/`User` acoplados por `id` compartido sin FK.** Obliga a `$queryRaw` y mapeos manuales (`user.prisma.repository.ts:135,191,286,600`).
- **`showHired` no se usa** para asignar documentos, solo como filtro del listado admin (`find-all-document.use-case.ts:17`). Decidir si es dimensión real o se retira.
- **Inconsistencia `RETIRADO` / `INACTIVO`:** `bulk-load-users.use-case.ts:24` mapea *Retired* → `'RETIRADO'`, mientras `bulk-info-participants.use-case.ts:73` y `autologin.use-case.ts:47` → `'INACTIVO'`. Confirmado que lo correcto es `INACTIVO`.
- **`console.log(data)` en `autologin.use-case.ts:69`** — imprime datos del participante en cada login.
- **Definición de "falta por subir":** el PDF dice "menos los aprobados"; `countRequiredDocs` cuenta `SUBIDO|EN_REVISION|REVISADO` como cumplido. La semántica actual es la correcta para el panel del participante, la del PDF para el de USE → conviene exponer **dos** contadores.
- **`OptionProgram.program` es `Program?`** (opcional) mientras `programId String` es requerido.

---

## 4. Decisiones de negocio confirmadas

### Ciclo de vida

- El proceso tiene **dos** estados: `EN_PROCESO` y `FINALIZADO`.
- `RETIRADO` **no** es estado de proceso: es el `INACTIVO` que ya se maneja cuando Workuse reporta *Retired*.
- Finalizado ⇒ **nada alterable**. Ningún cambio de catálogo lo afecta.
- **Nunca se borra nada.** Procesos anteriores, documentos e historial se conservan íntegros.

### Creación del proceso

| Disparador | Condición | Acción |
|---|---|---|
| Autologin | Sin ningún proceso | **Crea** `EN_PROCESO` |
| Autologin | Tiene proceso abierto | Usa ese + recalcula catálogo |
| Autologin | Solo finalizado(s) | 🚫 **Bloquea el login** |
| Batch diario | Sin ningún proceso | **Crea** `EN_PROCESO` |
| Batch diario | Tiene proceso abierto | Actualiza datos + recalcula catálogo |
| Batch diario | Solo finalizado(s) | Actualiza datos de la persona; **no toca el expediente** |
| USE · Finalizar (masivo) | Tiene proceso abierto | → `FINALIZADO`, congela |
| USE · Continuar | Último finalizado, ninguno abierto | **Mismo** registro → `EN_PROCESO`, documentos intactos |
| USE · Nuevo proceso | Último finalizado, ninguno abierto | **Registro nuevo**, todo `PENDIENTE`, `SIN_DOCUMENTOS` |

Autologin y batch ejecutan la **misma** operación de creación inicial ("si no tiene ninguno, créalo") ⇒ un solo caso de uso compartido.

**Continuar** y **Nuevo proceso** comparten condición de habilitación: se ofrecen juntos y USE elige.

### Datos del proceso nuevo

- Provienen del POST externo (`WorkuseService`). **Si la llamada falla, se aborta** — no se crea nada.
- El sponsor hereda la regla existente `status_hired === 1` (`autologin.use-case.ts:114`, `bulk-info-participants.use-case.ts:269`). Si el participante no está contratado, **el proceso nace sin sponsor y solo recibe documentos generales**.
- Documentos nuevos nacen en `PENDIENTE`; el status documental nace en `SIN_DOCUMENTOS`.
- Aplica a **todos** los documentos, incluidos los `INFORMATIVE`.

### Temporada

- Es **atributo del proceso**, no dimensión del catálogo. Las dimensiones de filtrado siguen siendo **4**: programa, opción, país, sponsor.
- Se resuelve **automáticamente**: la temporada activa del programa; si hay varias, la última creada; `null` si el programa no tiene ninguna.
  ```ts
  where: { programId, status: true }, orderBy: { createAt: 'desc' }, take: 1
  ```
- Backfill: los procesos de los participantes actuales de WAT USA nacen con temporada **2026-2027**.
- Si en el futuro se quiere filtrar documentos por temporada, es **aditivo** (`document_programs.temporadaId`) y no requiere rehacer nada.

### Cambio de sponsor o programa con proceso abierto

**Opción (a) elegida:** se actualiza el proceso abierto y se recalcula el catálogo.

- Los documentos del sponsor anterior que ya no aplican se desactivan.
- Los nuevos nacen en `PENDIENTE`.
- Lo ya subido que sigue aplicando se conserva.

Coherente con el PDF: *"mientras el status es en proceso, la lista se recalcula contra el catálogo cada vez que se abre el expediente"*. Permite eliminar todo el clonado porque la herencia **entre procesos** desaparece, que es lo que importaba.

### Visibilidad

Una sola regla:

> **Proceso visible = el proceso `EN_PROCESO` del participante; si no hay ninguno, el más reciente.**

- Participante con proceso finalizado y ningún otro → sigue apareciendo en los listados de USE con toda su información.
- Participante con proceso nuevo → se ve con la información, historial y documentos **del proceso actual**, no del anterior.
- El participante **nunca** ve sus procesos anteriores.
- Como la unicidad garantiza máximo un proceso activo, la regla es determinista.

### Opción de programa

**Sí filtra documentos** ⇒ `document_option_programs` es necesaria.

---

## 5. Esquema objetivo

```prisma
enum ProcesoEstado {
  EN_PROCESO
  FINALIZADO

  @@map("proceso_estado")
}

model Proceso {
  id               String        @id @default(uuid()) @db.VarChar(36)
  participanteId   String        @map("participante_id") @db.VarChar(36)
  programId        String        @map("program_id") @db.VarChar(36)
  optionProgramId  String        @map("option_program_id") @db.VarChar(36)
  sponsorId        String?       @map("sponsor_id") @db.VarChar(36)
  countryId        String        @map("country_id") @db.VarChar(36)
  temporadaId      String?       @map("temporada_id") @db.VarChar(36)
  fechaIngreso     DateTime      @default(now()) @map("fecha_ingreso")
  estado           ProcesoEstado @default(EN_PROCESO)
  statusDocumental UserStatus    @default(SIN_DOCUMENTOS) @map("status_documental")
  activo           Boolean?      // true cuando EN_PROCESO, NULL cuando FINALIZADO — nunca false
  finalizadoAt     DateTime?     @map("finalizado_at")
  finalizadoById   String?       @map("finalizado_by_id") @db.VarChar(36)
  crmProcesoId     String?       @map("crm_proceso_id") @db.VarChar(64)
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  // Máximo un proceso abierto por participante. MariaDB no soporta unique parcial:
  // se apoya en que los NULL no colisionan — mismo truco que ya usa UserDocuments.
  @@unique([participanteId, activo], map: "uq_proceso_activo")
  @@index([participanteId, fechaIngreso], map: "idx_procesos_participante")
  @@map("procesos")
}
```

`activo` es redundante con `estado`, pero es la única forma de garantizar la unicidad a nivel de base de datos. Se mantiene sincronizado en los tres únicos puntos que cambian el estado.

### Dimensiones faltantes del catálogo

```prisma
model DocumentOptionProgram {
  id              String  @id @default(uuid()) @db.VarChar(36)
  documentId      String  @map("document_id") @db.VarChar(36)
  optionProgramId String  @map("option_program_id") @db.VarChar(36)
  status          Boolean @default(true)

  @@unique([documentId, optionProgramId], map: "uq_document_option_program")
  @@map("document_option_programs")
}

model DocumentCountry {
  id         String  @id @default(uuid()) @db.VarChar(36)
  documentId String  @map("document_id") @db.VarChar(36)
  countryId  String  @map("country_id") @db.VarChar(36)
  status     Boolean @default(true)

  @@unique([documentId, countryId], map: "uq_document_country")
  @@map("document_countries")
}
```

Ambas siguen la regla **"sin filas = aplica a todos"**, igual que `document_sponsors`.

### Documentos del proceso

Decisión pragmática: se agrega `procesoId` y se colapsa el apuntador doble, pero **no se renombra** `UserDocuments` → `ProcesoDocumento` ni se elimina `userId` en esta iteración. Renombrar es cosmético y multiplicaría el diff sobre `UserDocumentHistory`, etiquetas, archivos de observación y ~20 queries. Ambos quedan como deuda de Fase 3.

```prisma
// UserDocuments — cambios
procesoId  String  @map("proceso_id") @db.VarChar(36)   // nuevo padre
documentId String  @map("document_id") @db.VarChar(36)  // el requisito — único apuntador
// documentSponsorId → ELIMINADO
// userId → se conserva denormalizado (deuda Fase 3)

@@unique([procesoId, documentId], map: "uq_proceso_documento")
// Se eliminan uq_user_documents_sponsor_active y uq_user_documents_document_active
```

### Status: espejo para no romper integraciones

`proceso.statusDocumental` es la **fuente de verdad histórica**; `User.status` se mantiene como **espejo del proceso activo**.

Motivo: `email-audience.prisma.repository.ts:17` segmenta audiencias de correo por `User.status`, y el dashboard funnel corre sobre los mismos valores. Con el espejo, ninguno de los dos se toca y aun así se conserva el status de cada proceso pasado.

### Puntero de proceso visible

```prisma
// User
procesoVisibleId String? @map("proceso_visible_id") @db.VarChar(36)
```

Se actualiza en los tres momentos en que puede cambiar (crear / finalizar / continuar). Permite que cada query existente agregue **un JOIN simple** en vez de un subquery "máximo por participante".

---

## 6. Plan de ejecución por fases

### Fase 0 — Independiente, sin migración de datos

Ver [detalle](#7-fase-0--tareas-detalladas). Se puede ejecutar y desplegar de inmediato; no depende de nada del resto del plan.

### Fase 1 — Catálogo (aditiva, riesgo bajo)

| # | Acción |
|---|---|
| **M1** | Migración: `document_countries` + `document_option_programs` |
| 1.1 | Filtrado por las 4 dimensiones, replicando el patrón `some`/`none` de sponsor |
| 1.2 | CRUD admin de país y opción en el formulario de documento |
| 1.3 | Test de no-regresión |

**Propiedad clave:** hoy no existe ninguna fila de país ni de opción, así que "sin filas = aplica a todos" hace que el resultado sea **idéntico al actual**. La Fase 1 se despliega y verifica sin cambiar el comportamiento de ningún participante. La conducta nueva empieza cuando USE llene esas tablas.

### Fase 2 — El proceso

Requiere el `RolesGuard` de Fase 0 (las acciones son exclusivas de USE).

| # | Acción |
|---|---|
| **M2** | Tabla `procesos` + enum `ProcesoEstado` (vacía) |
| **M3** | Backfill: un proceso `EN_PROCESO` por participante actual. WAT USA → temporada 2026-2027 |
| **M4** | `UserDocuments.procesoId` nullable → backfill → NOT NULL |
| **M5** | Colapsar apuntador doble + `@@unique([procesoId, documentId])` ⚠️ ver riesgos |
| **M6** | `User.procesoVisibleId` |
| 2.1 | Casos de uso: `EnsureProcesoInicial` (compartido autologin/batch), `CrearNuevoProceso`, `ContinuarProceso`, `FinalizarProceso` (masivo) |
| 2.2 | Reescribir `SyncUserDocumentsUseCase`: **eliminar** `cloneDocumentForNewSponsor`, `refreshDocumentFromLatest`, `parentDocByLinkId`, `bestRecord` |
| 2.3 | Congelar: si `estado = FINALIZADO`, el sync no toca el expediente |
| 2.4 | Bloqueo en `autologin.use-case.ts:173`, junto al de `INACTIVO` |
| 2.5 | Propagar "proceso visible" a listados, dashboard, exports y `email-audience` |
| 2.6 | Batch: crear proceso solo si no tiene ninguno; no tocar finalizados |

Módulos afectados por 2.5: `find-all-user`, `find-one-user`, `find-all-staff`, `export-participants-documents`, `get-status-funnel`, `find-participants-by-status`, `export-funnel-participants`, `email-audience`.

### Fase 3 — Limpieza

| # | Acción |
|---|---|
| 3.1 | FK explícita `Person` ↔ `User` |
| 3.2 | Eliminar `UserDocuments.userId` redundante |
| 3.3 | Renombrar `UserDocuments` → `ProcesoDocumento` |
| 3.4 | Separar `UserStatus` en dos enums (avance documental vs vigencia de cuenta) |
| 3.5 | Campo `etapa` en `documents` cuando se defina |
| 3.6 | Resolver `showHired`: aplicarlo como dimensión o retirarlo |
| 3.7 | `OptionProgram.name` legible + relación `program` no opcional |
| 3.8 | Dos contadores de completitud (subido vs aprobado) |

---

## 7. Fase 0 — tareas detalladas

Todas son independientes entre sí y del resto del plan.

### 0.1 — Secretos de Workuse a variables de entorno

**Archivos:** `src/shared/workuse/workuse.service.ts:10-12`, `src/config/env.schema.ts`, `.env`

1. Agregar `WORKUSE_API_KEY` y `WORKUSE_API_SECRET` al schema Zod (ambos `z.string().min(1)`).
2. Agregar también `WORKUSE_BASE_URL` (hoy hardcodeado en `:5`) para poder apuntar a staging.
3. Reemplazar las constantes por `envs.*`.
4. **Rotar el secreto con Workuse** — está commiteado en git, debe considerarse comprometido.

**Aceptación:** el repositorio no contiene ningún secreto; la app no arranca si faltan las variables (Zod aborta con `process.exit(1)`).

> ⚠️ La rotación es una acción externa que requiere coordinación con Workuse. El resto de la tarea no depende de ella.

### 0.2 — `RolesGuard` + decorador `@Roles` *(prerequisito de Fase 2)*

**Archivos nuevos:** `src/common/guards/roles.guard.ts`, `src/common/decorators/roles.decorator.ts`

1. Decorador `@Roles(...codes)` con `SetMetadata`, siguiendo el patrón de `public.decorator.ts`.
2. `RolesGuard` que lee el metadata con `reflector.getAllAndOverride` (handler + clase) y compara contra `JwtPayload.role`. El JWT ya lleva el rol (`autologin.use-case.ts:177`: `role.code ?? role.name`).
3. **Allowlist explícita**: sin metadata de roles → denegar por defecto en los controllers de staff, no permitir.
4. Registrar el guard como provider en cada feature module que lo use, junto a `JwtAuthGuard` (patrón del proyecto: guards por módulo, no globales).
5. Aplicar a los endpoints de staff, empezando por `UserDocumentsController`:
   - Solo staff: `aceptar-document`, `observar-document`, `bulk-aceptar-document`, `bulk-observar-document`, `terminar-revision`, `terminar-revision-masivo`, `bulk-upload-by-filename`, `revision-masiva-pasaporte`, `download-by-sponsor/*`, `bulk-extract-passport-data`.
   - Participante y staff: `by-user/:userId` (con la restricción de 0.3), `upload-file-document`, `documents-by-sponsor`.

**Aceptación:** un token de rol `PARTICIPANTE` recibe `403` en todos los endpoints de revisión. Verificar con un test e2e o con Swagger usando dos tokens.

> ❓ Depende de saber qué roles existen realmente en producción — ver [preguntas abiertas](#9-preguntas-abiertas).

### 0.3 — Cerrar el IDOR en `user-documents`

**Archivos:** `src/modules/user-documents/infrastructure/http/user-documents.controller.ts`, `dtos/upload-file-document.dto.ts`, `dtos/terminar-revision.dto.ts`

1. `GET /by-user/:userId` (`:112`): si el rol es `PARTICIPANTE`, ignorar el path y usar `JWT.sub`. Si es staff, permitir cualquier `userId`.
2. `POST /upload-file-document` (`:336`): **eliminar `userCreatedId` del DTO** y tomarlo de `@CurrentUser().sub`. Validar en el use case que el `userDocumentId` pertenezca al usuario del token cuando el rol sea `PARTICIPANTE`.
3. `POST /terminar-revision` (`:368`): `createdById` sale del JWT, no del body.
4. Revisar el resto de DTOs del módulo en busca del mismo patrón (ids de actor recibidos del cliente).

**Aceptación:** un participante autenticado no puede leer ni escribir sobre un expediente ajeno; los ids de actor ya no se aceptan desde el body.

### 0.4 — Normalizar el DNI

**Archivos nuevos:** `src/common/utils/dni.util.ts`, `prisma/normalize-dni.ts` (script)

1. `normalizeDni(value: string): string` — `trim`, quitar espacios/guiones/puntos, `toUpperCase`, sin ceros a la izquierda.
2. Aplicar en **todos** los puntos de entrada: `autologin.use-case.ts:68`, `bulk-info-participants.use-case.ts:167`, `bulk-load-users.use-case.ts:45`, y en `existsByDni` / `findByDni` / `updateByDni` / `upsertByDni`.
3. **Script de detección previo:** contar cuántos `Person.dni` existentes colisionarían al normalizar. `Person.dni` es `@unique`, así que `"01234567"` y `"1234567"` chocarían. Seguir el patrón de `prisma/verify-user-documents-unique.ts`.
4. Solo si el conteo es 0: script de backfill. Si no, resolver las colisiones manualmente antes.
5. No hacer `dni` NOT NULL todavía — requiere limpiar filas existentes; queda para Fase 3.

**Aceptación:** el script de detección reporta 0 colisiones y todos los DNI en base están normalizados.

> ⚠️ El paso 3 es obligatorio antes del 4. No ejecutar el backfill a ciegas.

### 0.5 — Corregir el mapeo `RETIRADO` → `INACTIVO`

**Archivo:** `src/modules/user/application/use-cases/bulk-load-users.use-case.ts:24`

`resolveUserStatus` devuelve `'RETIRADO'` cuando Workuse reporta *Retired*, mientras `bulk-info-participants.use-case.ts:73` y `autologin.use-case.ts:47` devuelven `'INACTIVO'`. Confirmado que `INACTIVO` es el correcto (es el que está en `STATUSES_LOCKED_FROM_DOCUMENT_SYNC`).

1. Cambiar a `'INACTIVO'`.
2. Verificar si hay participantes en base con status `RETIRADO` producto de este camino y decidir si se corrigen.

**Aceptación:** los tres caminos de ingreso producen el mismo status para un participante *Retired*.

### 0.6 — Quitar el `console.log` de debug

**Archivo:** `src/modules/auth/application/use-cases/autologin.use-case.ts:69`

`console.log(data)` imprime la respuesta completa de Workuse (datos personales del participante) en cada autologin. Eliminar.

**Aceptación:** ningún `console.log` en el camino de autenticación.

### Resumen de Fase 0

| # | Tarea | Tipo | Bloquea |
|---|---|---|---|
| 0.1 | Secretos Workuse a env + rotar | Seguridad | — |
| 0.2 | `RolesGuard` + `@Roles` | Seguridad | **Fase 2** |
| 0.3 | Cerrar IDOR | Seguridad | — |
| 0.4 | Normalizar DNI | Integridad | Integración CRM |
| 0.5 | `RETIRADO` → `INACTIVO` | Corrección | — |
| 0.6 | Quitar `console.log` | Limpieza | — |

---

## 8. Riesgos de migración de datos

### ⚠️ M5 — Colapsar el apuntador doble (el riesgo principal del plan)

Al mapear `documentSponsorId` → `documentId`, si un participante tiene **hoy** dos filas del mismo documento (una del sponsor anterior y otra del actual — precisamente lo que produce el clonado que se va a eliminar), ambas mapean al mismo `documentId` y **colisionan** contra el nuevo unique.

**Antes de escribir M5:**

1. Script de detección que cuente colisiones reales en producción, agrupando por `(userId, documentId_resuelto)`. Patrón disponible en `prisma/verify-user-documents-unique.ts`.
2. Backup con `prisma/backup-database.ts`.

**Regla de resolución propuesta** (validar contra los datos reales):

1. Gana el que tenga `statusDocument = true`.
2. Si hay dos activos, el de `updatedAt` más reciente.
3. Los perdedores **no se borran** — quedan como histórico con `statusDocument = false` colgados del mismo proceso.

### ⚠️ 0.4 — Normalización de DNI

`Person.dni` es `@unique`. Normalizar puede provocar colisiones entre registros que hoy conviven. Requiere script de detección previo (ver tarea 0.4).

### ⚠️ M3 — Backfill de procesos

Un proceso por participante, con `activo = true`. Si algún participante quedara con dos filas `activo = true`, la migración falla contra `uq_proceso_activo` — lo cual es el comportamiento deseado (falla ruidosa, no corrupción silenciosa).

---

## 9. Preguntas abiertas

Ninguna bloquea el arranque de la Fase 0 salvo la primera, que afecta solo a la tarea 0.2.

1. **¿Qué roles existen en producción además de `ADMIN` y `PARTICIPANTE`?**
   El seed (`prisma/seed.ts:21-41`) crea solo esos dos, pero existe un CRUD de roles, así que pueden haberse creado más (revisor, coordinador…). El `RolesGuard` necesita la lista real para construir la allowlist.

2. **¿Se corrigen los participantes que hoy tengan status `RETIRADO`** producto del bug de 0.5, o se dejan como están?

3. **¿`showHired` es una dimensión de aplicabilidad real o se retira?** (Fase 3.)

4. **¿El secreto de Workuse se puede rotar**, o hay dependencias de terceros que lo usan? (Tarea 0.1.)
