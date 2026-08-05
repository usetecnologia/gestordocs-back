# Revisión masiva de pasaportes — incidente del 4 de agosto de 2026 y trabajo pendiente

> **Documento de continuidad.** Escrito el 4/8/2026 para retomar el trabajo sin contexto previo.
> Léelo completo antes de tocar nada: hay un orden de ejecución que importa y una base de
> producción de por medio.

---

## 1. Qué pasó

El 4 de agosto de 2026 se ejecutó **sin que debiera** el endpoint de revisión masiva de pasaportes:

```
POST /api/v1/user-documents/revision-masiva-pasaporte
```

- **Controller:** `src/modules/user-documents/infrastructure/http/user-documents.controller.ts:421`
- **Use case:** `src/modules/user-documents/application/use-cases/bulk-extract-passport-data.use-case.ts`

El proceso toma el último pasaporte de **todos** los participantes, lo manda a OpenAI, y si detecta
un problema **observa el documento automáticamente**: crea un historial nuevo con status `OBSERVADO`
y la etiqueta *"Observado por IA"*, cambia el estado del participante y **le envía un correo**.
Corre en background y notifica al admin por correo con un Excel adjunto cada 100 participantes.

### Alcance real de la corrida

| Dato | Valor |
|---|---|
| Participantes analizados | 1300 |
| **Observaciones escritas en BD** | **245** |
| Ventana (UTC) | `2026-08-04 17:49:04` → `21:46:43` |
| Usuario que la disparó (`created_by_id`) | `d5165eff-2df4-4a87-a65e-3ea50cf4ad3d` |
| Etiqueta "Observado por IA" | `6de02d0d-a5ef-40c7-8488-7cf604a16d43` |
| Corridas anteriores con esta etiqueta | **ninguna** — solo existe la del 4/8 |

**Desglose de los 245 motivos** (recalculado sobre la BD el 5/8/2026 con
`inspect-mismatch-rule.ts`; suma exacta): **212** "menor de edad al emitirse el pasaporte",
**28** mismatch de content-type, **5** "no es un pasaporte".

> El desglose anterior (27 mismatch + 1 "cumplía 18 justo ese día") salía del Excel, que registra lo
> **detectado**, no lo **escrito**, y además omitía 9 participantes. Dos correcciones que salieron de
> ahí: los mismatches escritos son 28, no 27 (falta uno en la tabla de reparación, ver §4.4 b), y el
> caso "cumplía 18 justo ese día" **no está en la BD** — su mensaje mide 196 caracteres, así que
> nunca cupo en el `varchar(191)` y su INSERT siempre falló (ver §3, fix 3).

### El Excel que circula está incompleto

El archivo `revision-masiva-pasaporte (2).xlsx` (1300 filas) es un **correo de progreso (lote 13)**,
no el reporte final. Hay **9 participantes observados en BD que no aparecen en él**:

```
76459964, 60875911, 70716602, 76494859, 640185, 60916429, 71182713, 60998365, 75929151
```

**La fuente de verdad es la BD, no el Excel.** Se identifican por la etiqueta
`6de02d0d-a5ef-40c7-8488-7cf604a16d43` en `UserDocumentHistoryEtiquetas`.

### ⚠️ La base de datos del `.env` local es PRODUCCIÓN

`161.132.45.31:3394`, base `docs26`, `NODE_ENV=production`. Cualquier script que se corra desde
este repo con el `.env` actual toca la base real. Todo lo hecho hasta ahora fue **solo lectura**.

---

## 2. Los defectos encontrados

Investigando el incidente aparecieron cuatro bugs reales (más uno latente). **Los cinco están
arreglados al 5/8/2026; solo el fix 3 está además aplicado en producción, el resto espera despliegue.**

| # | Estado | Dónde | Qué está mal |
|---|---|---|---|
| 1 | ✅ **HECHO** | `aceptar-document.use-case.ts` | Perdía la URL del archivo al aceptar |
| 2 | ✅ **HECHO** | `aws-s3.service.ts` | Content-Type deducido del nombre, no del contenido |
| 3 | ✅ **HECHO Y APLICADO** | `schema.prisma` vs BD | `observation` era `varchar(191)` en producción |
| 4 | ✅ **HECHO** | `bulk-extract-passport-data.use-case.ts` | Falsos positivos de content-type |
| 5 | ✅ **HECHO** | `bulk-extract-passport-data.use-case.ts` | Robustez del batch (2 puntos descartados por decisión, ver §3) |

**No es bug:** que el proceso se ejecutara (la API hizo lo que le pidieron), ni las 212
observaciones por edad (es la regla de negocio tal como está definida — si el criterio no es el
correcto, eso lo decide el negocio).

---

## 3. Lo ya hecho (sin commitear; el fix 3 **ya está aplicado en la BD**, los fixes 1, 2, 4 y 5 sin desplegar)

Verificado: **78/78 tests, `npx tsc --noEmit` limpio, `npx eslint` limpio en los archivos tocados.**

### Fix 1 — El documento perdía su archivo al ser aceptado

**Síntoma:** el pasaporte de la participante **70627745 (Mariana Bocangel)** se quedó sin archivo
visible en la app. A las 21:34 la IA lo observó; a las 22:07 alguien lo aceptó para deshacer la
observación y el historial nuevo quedó con `url = NULL`.

**Causa:** `AceptarDocumentUseCase` buscaba la URL en el último historial con status `SUBIDO`. Los
documentos que entran por **carga masiva** se crean directamente en `REVISADO` y nunca tienen un
`SUBIDO` → `url = null` → se pierde la referencia al archivo (que sigue intacto en S3).
`ObservarDocumentUseCase` tenía el mismo bug. `BulkAceptarDocumentUseCase` lo heredaba por delegar.

**Solución:** nuevo helper de dominio `src/modules/user-documents/domain/user-document-file.ts` con
`resolveCurrentFileUrl(history)`, que toma el historial **más reciente que tenga URL**, sin importar
su status (todos los caminos que escriben historial guardan ahí la URL vigente). Usado en ambos use
cases.

**Archivos:** `domain/user-document-file.ts` (nuevo) + `.spec.ts` (nuevo, 5 casos),
`aceptar-document.use-case.ts`, `observar-document.use-case.ts`,
`aceptar-document.use-case.spec.ts` (nuevo, 4 casos).

> **Nota:** este bug es **anterior** a la revisión IA y venía perdiendo URLs desde hace semanas
> (`REVISADO` con `url IS NULL`: 43 el 13/07, 39 el 26/07, 65 el 27/07, 47 el 30/07 — esos números
> son cota superior porque incluyen documentos que legítimamente nunca tuvieron archivo, como
> HISTORICO). Hay que medir el histórico real con el filtro preciso (ver §4.5).

### Fix 2 — Content-Type deducido del nombre del archivo

**Síntoma:** abrir la URL de un pasaporte en el navegador da *"Failed to load"*, aunque el archivo
está perfecto.

**Causa:** el commit **`458d146` "fix url in documents" (1/7/2026 18:01)** cambió
`ContentType: file.mimetype` por `mime.lookup(ext)` — es decir, pasó a deducir el tipo de la
**extensión del nombre**. Un JPEG llamado `pasaporte.pdf` se guarda en S3 como `application/pdf`,
Chrome se lo entrega al visor de PDF y falla.

**Solución:** nuevo `src/common/utils/file-type.util.ts` con `detectFileType(buffer)` (firma de
bytes: PDF, JPEG, PNG, GIF, WEBP, HEIC, TIFF, BMP) y `extensionFromFilename(name)`. `uploadOne`
ahora deriva **el Content-Type y la extensión de la key** del contenido real; el nombre y el
mimetype declarado quedan como respaldo. De paso se corrigió que `split('.').pop()` devolvía el
nombre completo cuando no había punto (`documento` → key `uuid.documento`; ahora `.bin`).

**Archivos:** `common/utils/file-type.util.ts` (nuevo) + `.spec.ts` (nuevo, 11 casos),
`shared/aws/aws-s3.service.ts`, `aws-s3.service.spec.ts` (nuevo, 5 casos),
`bulk-extract-passport-data.use-case.ts` (3 líneas: usa el util compartido en vez de su copia local).

> **Efecto colateral esperado:** en el bulk de pasaportes, un archivo HEIC/TIFF/BMP ahora se reporta
> correctamente como "tipo de archivo no soportado" en vez de mandarse a OpenAI con un tipo
> equivocado. Es lo correcto (OpenAI no acepta HEIC), pero es un cambio de comportamiento.

> **Nota de formato:** prettier reformateó algunas líneas preexistentes en
> `observar-document.use-case.ts` y `aws-s3.service.ts`. No son cambios de lógica: esos archivos ya
> violaban el config del repo y `npm run lint` los habría tocado igual.

### Fix 3 — `observation` era `varchar(191)` en producción (5/8/2026)

**Síntoma:** 9 observaciones de la corrida nunca se escribieron. El `INSERT` fallaba con *"The
provided value for the column is too long"* y la transacción hacía rollback completo: ni historial,
ni cambio de status. Y no era solo del bulk — cualquier observación manual de más de 191 caracteres
fallaba igual.

**Causa:** no era una migración sin aplicar, como se pensó al principio: **la migración nunca se
generó**. La inicial (`20260615201822_init`) creó la columna como `VARCHAR(191)` y el `schema.prisma`
se editó a mano a `String? @db.Text` sin generar el `ALTER` correspondiente. `prisma migrate status`
decía "up to date" porque las 20 migraciones estaban registradas; la deriva no se veía desde ahí.

**Lo que se hizo:**

1. **Migración aplicada a producción** —
   `prisma/migrations/20260805000000_change_user_document_history_observation_to_text/`, un
   `ALTER TABLE UserDocumentHistory MODIFY observation TEXT NULL`. Aplicada con
   `npx prisma migrate deploy` el 5/8/2026 15:08 UTC. Verificado después: la columna es `text`
   (65535) y los datos están intactos (1398 filas con observación, la más larga sigue en 190
   caracteres / 192 bytes). No hubo riesgo de truncado: la ampliación no puede perder datos.
2. **Truncado defensivo** — nuevo `src/common/utils/text.util.ts` con `truncateToBytes()` y
   `exceedsByteLimit()`, aplicado en `UserDocumentsPrismaRepository.fitObservation()`. Se puso en el
   repositorio y no en el bulk porque `observarDocument` es **el único punto del código que escribe
   esa columna**: así queda cubierto el bulk, la observación manual y la masiva de una sola vez. Si
   un texto excede el límite se recorta y se deja un `logger.warn`, en vez de reventar la
   transacción. El corte es **por bytes, no por caracteres**: la columna es utf8mb4 y en la BD ya hay
   observaciones donde 190 caracteres ocupan 192 bytes, así que contar caracteres no protegería.
3. **Deriva revisada en toda la base** — `npx prisma migrate diff --from-config-datasource
   --to-schema prisma/schema.prisma --script` (solo lectura) devolvía **únicamente** ese `ALTER`.
   No hay ninguna otra columna desalineada; tras aplicar la migración el diff sale vacío.

**Archivos:** `common/utils/text.util.ts` (nuevo) + `.spec.ts` (nuevo, 10 casos),
`user-documents.prisma.repository.ts`, la carpeta de migración, y
`prisma/inspect-observation-column.ts` (nuevo, solo lectura).

> **Hallazgo:** el límite no solo tumbó las 9 observaciones que juntaban dos motivos. El motivo
> "cumplía exactamente 18 años el mismo día en que se emitió el pasaporte" mide **196 caracteres**
> siempre, con cualquier fecha: **nunca** cupo en `varchar(191)`. Esa regla de negocio era
> inaplicable — no hay ni una sola observación de ese tipo en la BD, y no la había desde que se
> escribió. Con la columna en `TEXT` ya funciona.

> **Ojo para el futuro:** los DTOs de observación (`review-document.dto.ts`,
> `bulk-observar-document.dto.ts`) **no tienen `@MaxLength`**. Con la columna en TEXT ya no es
> urgente, pero la API sigue aceptando textos de cualquier tamaño y ahora se recortan en silencio
> (con warning en el log). Si se quiere rechazar en vez de recortar, ahí es donde va el límite.

### Fix 4 — Falsos positivos de content-type (5/8/2026)

**Síntoma:** 22 de las 245 observaciones fueron por un mismatch de content-type que no afectaba a
nada: el archivo se veía perfectamente.

**Causa:** la comparación era de strings exactos (`headerContentType !== detectedFromBytes`). Pero los
navegadores hacen *sniffing* dentro de las imágenes: un PNG servido como `image/jpeg` se muestra sin
problema. El desajuste solo rompe la visualización cuando cruza la frontera entre familias
(imagen ↔ PDF), porque ahí el archivo va al visor equivocado.

**Solución:** tres funciones nuevas en `common/utils/file-type.util.ts` —donde ya vive la detección
por bytes del fix 2— y su uso en el bulk:

- `normalizeContentType()`: minúsculas, sin parámetros (`; charset=…`) y con los alias unificados
  (`image/pjpeg` e `image/jpg` → `image/jpeg`, `image/x-png` → `image/png`, `image/heif` → `image/heic`,
  `application/x-pdf` → `application/pdf`).
- `renderingFamily()`: clasifica un Content-Type en `image` | `pdf` | `other`, que es lo que decide
  cómo lo muestra el navegador.
- `breaksRendering(declared, detected)`: `true` solo si las familias difieren.

Se aplicó además `normalizeContentType()` al `contentType` que se propaga en `downloadFileOnce`,
porque aguas abajo se compara contra `SUPPORTED_CONTENT_TYPES` como string exacto: sin eso, un
`image/pjpeg` o un `IMAGE/JPEG` perfectamente legible se descartaba como "tipo de archivo no
soportado".

> **Decisión:** la regla es "familias distintas", no literalmente "una parte es PDF y la otra
> imagen". Sobre los datos reales da el mismo resultado (`detectFileType` solo devuelve imágenes o
> PDF), pero además cubre el caso de un archivo servido con un tipo que el navegador no renderiza
> —`text/plain`, `application/msword`— que también queda invisible. `application/octet-stream` se
> sigue excluyendo aparte: no es una declaración incorrecta, es la ausencia de declaración.

**Validado contra los datos reales de la corrida** con `prisma/inspect-mismatch-rule.ts` (solo
lectura), que extrae los pares declarado/detectado de las observaciones ya escritas y les aplica la
regla nueva:

```
Observaciones por content-type en la BD:  28
  La regla nueva SÍ las observa:           6   ← mismatch real
  La regla nueva las descarta:            22   ← falsos positivos, exactamente los de §4.4 c
Combinaciones: 21 jpeg→png, 3 pdf→jpeg, 3 jpeg→pdf, 1 pjpeg→jpeg
```

Los 22 descartados coinciden **uno a uno** con la lista de falsos positivos de §4.4 (c).

> **⚠️ Hallazgo: los mismatches reales son 6, no 5.** Aparece **76459964** (Romina Kuwata), que
> faltaba en la tabla de §4.4 (b) porque esa tabla se armó desde el Excel y 76459964 es justamente
> uno de los 9 participantes que el Excel omitía. Ya está agregado a la tabla.

**Archivos:** `common/utils/file-type.util.ts`, `file-type.util.spec.ts` (10 casos nuevos),
`bulk-extract-passport-data.use-case.ts`, `prisma/inspect-mismatch-rule.ts` (nuevo, solo lectura).

### Fix 5 — Robustez del batch (5/8/2026)

Cuatro de los seis puntos de la lista original quedaron resueltos; los otros dos se descartaron por
decisión explícita (abajo). Todo verificado con un spec nuevo del use case: **9 casos**, el primero
que tiene este batch.

**a) Un fallo suelto ya no tumba la corrida** — era el más grave. `findParticipantInfo()` estaba
fuera del `try` de `processCandidate`: un timeout de BD ahí hacía rechazar el `Promise.all`, el
`.catch(() => {})` del controller se lo tragaba —sin correo, sin Excel, horas de trabajo perdidas— y
los otros dos workers **seguían corriendo**, escribiendo observaciones con el lock ya liberado, con
el riesgo de que una segunda corrida entrara en paralelo sobre las mismas filas.

Dos capas de protección:
- La llamada se movió dentro del `try`, con su propio `catch`: el DNI es solo para el reporte, así
  que si no se puede leer se sigue evaluando y la fila sale sin DNI (con un `warn` en el log).
- `mapWithConcurrency` recibe ahora un `onItemError` obligatorio: si la función de un item lanza, se
  registra esa fila como fallida y el worker continúa. Ningún fallo individual puede abortar el
  batch ni dejar workers huérfanos.

**b) El Excel distingue los cuatro desenlaces** — antes `OBSERVADO = NO` mezclaba "el pasaporte está
correcto" con "no se pudo ni evaluar", que son opuestos: el primero no requiere nada, el segundo hay
que reintentarlo. Se agregó la columna **ESTADO** (y se mantuvo `OBSERVADO` SI/NO para no romper a
quien ya la lee):

| ESTADO | Significado |
|---|---|
| `OBSERVADO` | Evaluado, con problema, observación registrada |
| `CORRECTO` | Evaluado, sin problemas |
| `NO SE PUDO EVALUAR` | Descarga fallida, tipo no soportado o error de la IA |
| `ERROR AL REGISTRAR LA OBSERVACIÓN` | Evaluado y con problema, pero la observación **no** se guardó — requiere reintento |

El cuarto estado es exactamente el caso de los 9 del `varchar(191)`: antes salían como
`OBSERVADO = SI` aunque en la BD no se hubiera escrito nada. El correo final reporta los cuatro
conteos.

**c) Los correos de progreso llevan solo su lote** — antes adjuntaban el acumulado completo (100,
200, 300… filas), así que el adjunto crecía hasta que el proveedor podía rechazarlo, y el último
correo de progreso era indistinguible del reporte final. El adjunto ahora se llama
`revision-masiva-pasaporte-lote-N-de-M.xlsx`, trae solo sus filas y el cuerpo avisa en texto que es
un correo de progreso. **Esto es lo que causó la confusión del incidente**: el Excel que circuló era
el correo de progreso del lote 13, no el reporte final, y por eso le faltaban 9 participantes.

**d) Timeouts** — dos sitios podían retener un worker indefinidamente:
- `fetch` no tenía ninguno: ahora usa `AbortSignal.timeout(30s)`, que cubre también la lectura del
  body (una conexión que acepta y nunca envía datos colgaba el worker para siempre). El mensaje de
  error distingue el timeout de un fallo de red normal, y los reintentos existentes siguen aplicando.
- El cliente de OpenAI se creaba sin `timeout` ni `maxRetries`, así que usaba los defaults del SDK:
  **10 minutos por llamada y 2 reintentos = hasta media hora por un solo pasaporte**. Ahora son
  120s y 2 reintentos (~6 min de tope por documento).

**Descartado por decisión (5/8/2026), queda como limitación conocida:**

- **El resultado sigue viviendo solo en el correo.** Si el envío final falla o el proceso se
  reinicia, se pierde el reporte de la corrida. Se evaluó subir el Excel a S3 (y, más allá, permitir
  reanudar) y se decidió no hacerlo por ahora. Mitigación parcial ya en marcha: los correos por lote
  del punto (c) hacen que un fallo del correo final no se lleve todo.
- **El lock `isRunning` sigue en memoria.** Protege solo dentro de un proceso Node; la API corre como
  una sola instancia, así que alcanza. Si algún día se escala horizontalmente hay que moverlo a Redis
  (mismo caso que `BulkInfoParticipantsUseCase`).

**Archivos:** `bulk-extract-passport-data.use-case.ts`,
`bulk-extract-passport-data.use-case.spec.ts` (nuevo, 9 casos),
`infrastructure/external/openai-passport-extractor.client.ts`.

---

## 4. Lo que falta

### 4.1 Fix 3 — Migración: `observation` a `TEXT` ✅ HECHO (5/8/2026)

**Resuelto y aplicado en producción** — el detalle está en §3. Los tres puntos que quedaban
(migración, truncado defensivo, revisión de deriva en el resto de la base) están cerrados.

Lo único que sigue vigente de esta sección son los **9 participantes cuya observación nunca se
escribió** por el límite anterior:

```
73883268, 60881195, 60798124, 60790579, 60819212, 71168564, 61345216, 71188433, 71814523
```

Para estos 9 **no hay nada que revertir: quedaron intactos** (ejemplo: 73883268 / Abigail Alvarez
sigue en `PREPARACION` con su pasaporte en `REVISADO`). Arreglar la columna **no** los observa
retroactivamente: si el negocio quiere que se evalúen, hay que volver a pasarlos por la revisión —
y hacerlo **después** de los fixes 4 y 5, o volverán a salir los falsos positivos de content-type.

### 4.2 Fix 4 — Falsos positivos de content-type ✅ HECHO (5/8/2026)

**Resuelto** — el detalle y la validación contra los datos reales están en §3. Resumen: de las 28
observaciones por content-type escritas en la BD, la regla nueva mantiene **6** (mismatch real) y
descarta **22** (los mismos de §4.4 c).

Queda pendiente **desplegarlo**: hasta que esté en producción, una nueva corrida volvería a generar
los mismos falsos positivos.

### 4.3 Fix 5 — Robustez del batch ✅ HECHO (5/8/2026)

**Resuelto** — el detalle está en §3. De los seis puntos originales: cuatro arreglados (fallos que
tumbaban la corrida, cuatro estados en el Excel, correos de progreso por lote, timeouts de `fetch` y
de OpenAI) y dos descartados por decisión, que **siguen siendo limitaciones conocidas**: el resultado
solo vive en el correo, y el lock `isRunning` es en memoria (válido mientras la API corra en una sola
instancia).

Queda pendiente **desplegarlo**.

### 4.4 Reparación de datos ⬜

> **ACTUALIZACIÓN 5/8/2026 — el alcance creció:** se decidió **revertir las 245 observaciones
> completas**, no solo los 22 falsos positivos. Ese trabajo tiene su propio documento con el
> inventario ya ejecutado y las decisiones pendientes:
> **`docs/PENDIENTE-reversion-observaciones-ia.md`**.
>
> Dos hallazgos de esa fase que corrigen lo escrito más abajo:
> - **No se envió ningún correo** a los participantes (la acción `DOCUMENTO_OBSERVADO` no tiene
>   plantilla asociada). El punto (d) de esta sección queda sin efecto.
> - **El fix 1 no es requisito para la reversión**, porque va por escritura directa a la BD y no por
>   el flujo de "aceptar". Sigue siendo necesario desplegarlo antes de que el equipo vuelva a operar
>   con normalidad.


**Orden obligatorio: el fix 1 debe estar desplegado antes de tocar nada de esto.** El camino natural
para quitar una observación es *aceptar* el documento, y sin el fix 1 eso borra la URL — es
exactamente lo que le pasó a Mariana. Sin el fix, limpiar los 22 falsos positivos rompería 22
documentos más.

**a) URL de Mariana (70627745)** — 1 fila, recuperable.
`userDocumentId = a7733b6e-15e8-400e-8569-a0ad1054f551`. Su último historial (`2026-08-04 22:06:59`,
`REVISADO`) tiene `url = NULL`; la URL previa es
`https://use-515504445665-us-east-1-an.s3.us-east-1.amazonaws.com/user-documents/bulk/bc68d9d2-3c79-41e3-8653-f4aa369bcbce.pdf`.

**b) Los 6 archivos con mismatch real** — `CopyObject` sobre sí mismos con
`MetadataDirective: 'REPLACE'` y el Content-Type correcto. Todos en
`https://use-515504445665-us-east-1-an.s3.us-east-1.amazonaws.com/user-documents/bulk/`:

| DNI | Archivo | S3 declara | Es en realidad | Corregir a |
|---|---|---|---|---|
| 61035475 | `905df4bb-f1f1-4d4c-b2d9-6fb2c3fea9aa.pdf` | `application/pdf` | JPEG | `image/jpeg` |
| 73117424 | `b666e2f7-b034-4cf4-8ce9-bcc29ebbfa40.jpg` | `image/jpeg` | PDF | `application/pdf` |
| 61987492 | `a80b04df-fe07-4a34-ae0e-f2b40892dbc0.jpg` | `image/jpeg` | PDF | `application/pdf` |
| 70720728 | `dd7abdc3-a669-4b84-b70d-8ac5159f116e.jpg` | `image/jpeg` | PDF | `application/pdf` |
| 70627745 | `bc68d9d2-3c79-41e3-8653-f4aa369bcbce.pdf` | `application/pdf` | JPEG | `image/jpeg` |
| **76459964** | `eb9e2725-e58f-456c-9196-14d45327c41e.pdf` | `application/pdf` | JPEG | `image/jpeg` |

Los tres declarados `image/jpeg` que en realidad son PDF **son los peores**: no se ven ni en la app
ni en el link directo, y llevan así **desde el 3 de julio** sin que nadie lo reportara.

> **76459964 (Romina Kuwata)** se agregó el 5/8/2026 al validar el fix 4 contra la BD; faltaba porque
> la tabla se armó desde el Excel, que omitía a ese participante. Su pasaporte es
> `userDocumentId = 80c41f07-a756-4798-af7c-068c9fec44e6`, subido el 1/7 a las 23:17 — después del
> commit que introdujo el bug del fix 2, igual que los demás.

**c) Limpiar los 22 falsos positivos** — observados únicamente por un mismatch imagen↔imagen, o sea
por nada. Lista cerrada y exacta (los otros 8 falsos positivos tenían además un motivo de edad, y
resulta que son justamente 8 de los 9 que fallaron al escribir, así que de esos no quedó nada en
BD):

```
74843711, 76680379, 76143425, 73974831, 61002232, 70501380, 73437846, 73222122,
70465150, 73032220, 76276153, 76535703, 74883765, 75887211, 72934212, 71814035,
60192301, 61241556, 60789969, 70593442, 73268487, 76016920
```

**d) Correos ya enviados** — irreversibles. `TerminarRevisionUseCase` se llamó **sin**
`suppressParticipantEmail`, así que los participantes que transicionaron a `OBSERVADO` recibieron el
correo "documento observado". Se pueden listar desde `historial_correos` (`EmailLog`,
`actionCode = 'DOCUMENTO_OBSERVADO'`) filtrando por la ventana de la corrida, por si se quiere
mandar una aclaración.

### 4.5 Barridos pendientes ⬜

- **S3:** buscar **todos** los objetos subidos después del 1/7/2026 18:01 cuyo Content-Type declarado
  no coincida con sus bytes. Los 5 de arriba son solo los pasaportes; el bug afectó a cualquier
  documento subido con la extensión equivocada desde esa fecha.
- **URLs perdidas:** contar los casos históricos reales del bug del fix 1 con el filtro preciso
  (historial con `url IS NULL` **cuyo documento sí tenía URL en un historial anterior**) y hacer el
  backfill. Ver `prisma/inspect-null-url-scope.ts`.

---

## 5. Scripts de inspección (SOLO LECTURA)

Creados durante la investigación, en `prisma/`. **Ninguno escribe nada.** Se corren con:

```bash
npx ts-node -r tsconfig-paths/register prisma/<script>.ts [args]
```

| Script | Para qué |
|---|---|
| `inspect-participant-passport.ts <dni>` | Todos los documentos e historiales de un participante, + su `UserHistoryStatus` |
| `inspect-run-scope.ts` | Tipo real de las columnas en producción y alcance de la corrida IA por día |
| `inspect-run-crosscheck.ts <ruta-excel>` | Cruza las observaciones escritas en BD contra el Excel del reporte |
| `inspect-null-url-scope.ts` | Documentos que quedaron sin URL, con su URL previa recuperable |
| `inspect-observation-column.ts` | Tipo real, tamaño y contenido de `observation` + últimas migraciones aplicadas |
| `inspect-mismatch-rule.ts` | Contrasta la regla nueva de mismatch (fix 4) contra los mismatches ya escritos + desglose de los 245 motivos |

Borrables cuando el incidente esté cerrado.

---

## 6. Orden de ejecución recomendado

1. ✅ Fix 1 — `aceptar-document.use-case.ts` **(hecho, falta desplegar)**
2. ✅ Fix 2 — `aws-s3.service.ts` **(hecho, falta desplegar)**
3. ✅ Fix 3 — migración `observation` → `TEXT` **(hecha y aplicada en producción el 5/8)**
4. ✅ Fix 4 — regla de mismatch por familias de renderizado **(hecho, falta desplegar)**
5. ✅ Fix 5 — robustez del batch **(hecho, falta desplegar)**
6. ⬜ **Desplegar** (mínimo los fixes 1 y 2 antes de cualquier reparación de datos)
7. ⬜ Reparar datos: URL de Mariana → Content-Type de los 6 archivos → limpiar los 22 falsos positivos
8. ⬜ Barridos de S3 y de URLs perdidas

---

## 7. Verificación

```bash
npx jest                       # 78/78 al 5/8/2026 (tras los fixes 3, 4 y 5)
npx tsc --noEmit -p tsconfig.json
npx eslint src/...             # solo sobre los archivos tocados; el repo no está lint-limpio del todo
```

Antes de dar por cerrada la reparación de datos: revisar en el frontend una muestra de 5-10
participantes, incluyendo alguno de los 22 falsos positivos, alguno de los 6 del mismatch real y a
Mariana (70627745).
