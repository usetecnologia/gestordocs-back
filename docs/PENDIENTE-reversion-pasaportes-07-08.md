# Reversión de las 371 observaciones automáticas del viernes 7/8/2026

> **Documento de continuidad.** Escrito el 11/8/2026. **Segundo incidente del mismo API.** El primero
> fue el 4/8/2026 y ya se revirtió — su análisis está en
> **`docs/PENDIENTE-reversion-observaciones-ia.md`** y conviene leer al menos su §1 y la tabla de
> "qué escribió el API por cada observación", porque acá no se repite.
>
> ## ⛔ ESTADO: NADA REVERTIDO TODAVÍA — inventario confirmado, esperando decisiones
>
> Fase 1 (inventario) completa y cruzada contra el Excel del reporte: **cuadra exacto**. La reversión
> no se ha ejecutado. Bloquea en las preguntas de §6.

---

## 1. La corrida

Alguien volvió a ejecutar `POST /api/v1/user-documents/revision-masiva-pasaporte` el **viernes 7/8
por la noche**. Analizó **2.158 pasaportes** y observó automáticamente **371**.

| Dato | Valor |
|---|---|
| Etiqueta "Observado por IA" | `6de02d0d-a5ef-40c7-8488-7cf604a16d43` |
| Ventana (UTC) | `2026-08-08 01:21:40.089` → `2026-08-08 04:42:54.751` |
| Ventana (hora Perú) | viernes 7/8 **20:21 → 23:42** |
| `created_by_id` de todas las escrituras | `d5165eff-2df4-4a87-a65e-3ea50cf4ad3d` |
| Quién es ese autor | cuenta **`usedocs` / "USE Administrador"** (`vcosio@workuse.com`), rol Administrador |
| Observaciones escritas | **371** (371 documentos distintos, 371 participantes distintos) |
| Otras escrituras del mismo autor en la ventana | **0** — la corrida no tocó nada más |
| Correos enviados a participantes | **0** (ver §4) |

**No hay cron ni job programado**: el único disparador de `BulkExtractPassportDataUseCase` es ese
endpoint HTTP (verificado en todo `src/`). Fue una **invocación manual** con el token de la cuenta
admin compartida — y como esa cuenta la usan varias personas y también el cron diario, la BD no dice
qué persona apretó el botón. Habrá que preguntarlo o buscarlo en los logs del server.

### El Excel del reporte cuadra exacto con la BD

Se cruzó `revision-masiva-pasaporte (3).xlsx` (2.158 filas) contra las escrituras reales:

```
Excel: 2.158 filas → OBSERVADO 371 · CORRECTO 1.787
BD:                              371 observaciones
Observados en el Excel que NO están en BD:   0
Observaciones en BD que NO están en el Excel: 0
```

A diferencia del 4/8 —donde el Excel que circuló era un correo de progreso y le faltaban 9
participantes— **este Excel es el reporte final y es fiable**. Aun así, el inventario se armó
**desde la BD**, no desde el Excel; el Excel se usó solo para validar.

Las **1.787 filas `CORRECTO` no escribieron nada** en la base: el use case solo escribe cuando hay
motivo de observación (`processCandidate` → `observeCandidate`). No hay nada que revertir para ellas.
Tampoco hubo filas `NO SE PUDO EVALUAR` ni `ERROR AL REGISTRAR`: los 2.158 se evaluaron y registraron
sin fallos.

### Por qué se observó cada uno

| Motivo | Casos |
|---|---|
| El participante era menor de edad al momento de emitirse el pasaporte | **364** |
| El documento analizado no corresponde a un pasaporte | 5 |
| Cumplía exactamente 18 años el mismo día de la emisión | 2 |
| Mismatch de content-type | **0** |

> **Ojo con esto:** el 98 % de las observaciones (364 de 371) sale de **una sola regla**, la de
> mayoría de edad al emitirse el pasaporte. Cero mismatch de content-type, que era el motivo
> mayoritario de falsos positivos del 4/8. Si esa regla no refleja lo que el negocio quiere —un
> pasaporte emitido a los 17 años es perfectamente válido— entonces el problema no es solo que la
> corrida se disparó por error, sino **qué observa la corrida cuando se dispara**. Es una pregunta de
> negocio (§6, P5), no técnica, pero conviene cerrarla antes de que el API se ejecute una tercera vez.

### 204 de los 371 son documentos que YA se habían revertido el 5/8

```
Corrida 4/8 (revertida):  246 participantes
Corrida 7/8 (actual):     371 participantes
Solapamiento:             204   ← mismo userDocumentId, re-observado
Nuevos:                   167
```

La reversión del 5/8 devolvió esos 204 documentos a `REVISADO`; esta corrida los volvió a observar.
Es la razón principal de que ahora sean 371 y no 245: **el mismo trabajo se está deshaciendo dos
veces**. Mientras el endpoint siga accesible sin cambios, una tercera corrida repetirá el ciclo.

---

## 2. Qué cambió exactamente (inventario confirmado)

Por cada una de las 371 observaciones el API escribió lo mismo que el 4/8 (tabla completa en el otro
documento, §"Qué escribió el API"): fila en `UserDocumentHistoryEtiquetas`, fila nueva en
`UserDocumentHistory` con status `OBSERVADO`, `UserDocuments.status` → `OBSERVADO`, fila en
`UserHistoryStatus` y `User.status` → `OBSERVADO`/`OBSERVADO_SPONSOR`.

### Documentos

| | |
|---|---|
| Status actual | `OBSERVADO` 359 · `REVISADO` 8 · `SUBIDO` 4 |
| Status previo a restaurar | `REVISADO` 355 · `OBSERVADO` 12 · `SUBIDO` 4 |

**La reconstrucción del estado previo es fiable al 100 % en los 371 casos**: ninguno se quedó sin
historial anterior y ninguno se quedó sin su cambio de estado de participante localizado (los dos
huecos que en el 4/8 obligaban a excluir casos). Los 12 que vuelven a `OBSERVADO` son documentos que
ya estaban observados antes de la corrida.

### Participantes

| | |
|---|---|
| Estado que dejó la corrida | `OBSERVADO` 288 · `OBSERVADO_SPONSOR` 83 |
| Estado actual | `OBSERVADO` 260 · `OBSERVADO_SPONSOR` 82 · `INACTIVO` 17 · `PREPARACION` 4 · `PENDIENTE_REVISAR` 3 · `DOCUMENTOS_SUBIDOS` 2 · `DOCUMENTOS_INCOMPLETOS` 2 · `ENVIADO_SPONSOR` 1 |
| Estado previo a restaurar | `PREPARACION` 134 · `DOCUMENTOS_INCOMPLETOS` 81 · `ENVIADO_SPONSOR` 81 · `PENDIENTE_REVISAR` 25 · `DOCUMENTOS_SUBIDOS` 21 · `INACTIVO` 17 · `OBSERVADO` 10 · `OBSERVADO_SPONSOR` 2 |

**100 participantes están en un estado que el sync diario NO reevalúa**
(`OBSERVADO_SPONSOR` 82 · `INACTIVO` 17 · `ENVIADO_SPONSOR` 1 — ver `STATUSES_LOCKED_FROM_DOCUMENT_SYNC`).
Para esos, revertir el documento **no** alcanza: si no se les restaura el estado explícitamente,
quedan observados para siempre. Los ~260 en `OBSERVADO` sí los recalcularía el cron de las 02:00 solo.

**37 participantes ya tienen su estado previo**, sin hacer nada: entre ellos los **17 `INACTIVO`**,
que estaban `INACTIVO` antes de la corrida, la corrida los pasó a `OBSERVADO` y el cron diario ya los
devolvió a `INACTIVO`. A esos 17 solo hay que revertirles el documento.

---

## 3. Los "292 conflictos" no son 292 problemas

El criterio estricto del inventario (cualquier escritura posterior descalifica) marca 79 reversibles
y 292 conflictos. Igual que el 4/8, la enorme mayoría es ruido del cron diario, no trabajo humano
pisado:

| | Casos | Qué pasó |
|---|---|---|
| **A. Documento realmente tocado después** | **12** | Alguien subió o aceptó el documento. → **excluir** |
| B1. Limpio, sin nada posterior | 79 | Reversible directo |
| B2. Solo se movió el estado del participante | 280 | Documento **intacto** en `OBSERVADO` |
| → de esos, movidos solo por el cron/sistema | 276 | `bulk-info-participants-daily` reafirmando `OBSERVADO` cada día a las 07:00 UTC |
| → con intervención de una persona | 4 | `70949383`, `60871469`, `70714833`, `71495652` — pero los 4 siguen con doc `OBSERVADO` y user `OBSERVADO`: nadie los resolvió, solo los mirό |
| B3. Otros motivos | 0 | — |

**En términos operativos: 359 de los 371 documentos siguen intactos y son revertibles con
seguridad.** Los únicos 12 a excluir son los de la categoría A:

| DNI | Status actual | Qué pasó después |
|---|---|---|
| 72613065 | REVISADO | subió doc 9/8, aceptado 10/8 |
| 70636377 | REVISADO | subió doc 10/8, aceptado 10/8 |
| 70592556 | REVISADO | subió doc 9/8, aceptado 10/8 |
| 61345369 | REVISADO | aceptación manual 10/8 |
| 60798081 | REVISADO | subió doc 10/8, aceptado 10/8 |
| 60880295 | SUBIDO | subió doc 9/8 |
| 60556582 | REVISADO | subió doc 10/8 (×2), aceptado 10/8 |
| 60772118 | SUBIDO | subió doc 11/8 |
| 60822745 | REVISADO | subió doc 10/8, aceptado 10/8 |
| 71161455 | REVISADO | subió doc 9/8, aceptado 10/8 |
| 61482158 | SUBIDO | subió doc 10/8 |
| 60777503 | SUBIDO | subió doc 10/8 |

En los 12 el flujo normal ya resolvió el caso (8 en `REVISADO`, 4 en `SUBIDO` esperando revisión):
no hay que tocar ni el documento ni el estado. Queda pendiente decidir si se les borra igualmente el
historial de la IA, que sigue ahí (§6, P3).

---

## 4. Correos: otra vez no se envió ninguno

```
historial_correos desde el 6/8: 0 filas — de ninguna acción
Correos "DOCUMENTO_OBSERVADO" en la ventana de la corrida: 0
```

Mismo mecanismo que el 4/8: la acción `DOCUMENTO_OBSERVADO` no tiene plantilla asociada y
`EmailDispatchService.dispatchByActionCode` sale en `if (!template) return;` antes de enviar y antes
de registrar. **Lo único irreversible del incidente no ocurrió.**

Y sigue vigente el efecto secundario que ya se señaló hace una semana y no se ha atendido: **hoy
ningún participante recibe aviso cuando le observan un documento**, ni en las revisiones manuales.

---

## 5. La etiqueta IA ya no identifica una corrida (peor que el 4/8)

Filas con la etiqueta `6de02d0d-…` en toda la historia:

| Fecha | Autor | Filas | Qué es |
|---|---|---|---|
| 4/8 17:49 → 21:39 | `d5165eff` (usedocs) | 15 | restos de la corrida del 4/8 — los 15 excluidos de esa reversión |
| 5/8 16:10 | `fe52eded` (Fernanda Aste) | 1 | observación **manual** con la etiqueta IA |
| **7/8 15:35** | **`28f747e6` (Andrea Gutierrez)** | **1** | observación **manual** con la etiqueta IA — **caso nuevo** |
| **8/8 01:21 → 04:42** | **`d5165eff` (usedocs)** | **371** | **← la corrida a revertir** |

Ya son **dos** personas usando la etiqueta "Observado por IA" a mano, y el aviso al equipo que quedó
pendiente el 5/8 no se dio. Por eso el inventario filtra por **etiqueta + autor + ventana**, nunca
solo por etiqueta. Cualquier script de ejecución debe hacer lo mismo.

---

## 5-bis. Decisiones tomadas el 11/8 y validación de estados (Fase 2)

### Decisiones

| # | Decisión |
|---|---|
| **Estados** | **Restaurar el estado exacto previo** a cada participante, como el 5/8 — condicionado a la validación de abajo |
| **Los 12 ya trabajados** | **No tocarlos en absoluto**: ni documento, ni estado, ni historial de la IA |
| **Los 12 ya observados antes** | Revertir los 5 normales (`70628864`, `74528656`, `72622168`, `70714833`, `71386052`); **excluir** los 2 de prueba (`12345666`, `12345678`) y los 5 `INACTIVO` (`73254293`, `71155531`, `73984442`, `71183524`, `70487231`) |
| **Los 2 casos conflictivos** | **Excluir por completo** a `70710164` y `70644102` — ni documento, ni estado, ni historial |
| **Filas del cron posteriores** | **Dejarlas.** Solo se borra lo que escribió la corrida; el rastro queda algo incoherente y se acepta (ver "Qué NO se borra") |

Total excluido por decisión: **21** (12 ya trabajados + 2 de prueba + 5 `INACTIVO` + 2 conflictivos).

**Alcance final de la reversión: 350 documentos** — 326 con restauración de estado + 22 sin escritura
de estado (su estado actual ya es el previo) + 2 que salen del grupo "seguro" al excluirse.

### ¿Se pierde algo al restaurar el estado exacto? (`revert-ia2-02-validar-estados.ts`)

**292 de los 371 cambiaron de estado después de la corrida**, pero eso no significa que 292 tengan
trabajo que pisar: **243 lo hicieron exclusivamente en el horario del cron** (07:0x UTC), reafirmando
el mismo `OBSERVADO` porque el documento seguía observado. Ese cambio no aporta información propia:
es la corrida rebotando cada mañana.

El criterio usado es: *se pierde algo solo si el participante **salió** del estado observado por
trabajo legítimo, o si hay una razón vigente para que deba seguir observado.* Resultado:

| Veredicto | Casos | Qué implica |
|---|---|---|
| `SEGURO` | 323 | Nunca salió del estado que le puso la corrida. Restaurar no pierde nada |
| `SEGURO_CON_TRANSITO` | 5 | Alguien lo puso `EN_REVISION` y volvió a `OBSERVADO`. El estado final sigue siendo obra de la corrida |
| `SIN_CAMBIO_NECESARIO` | 22 | Su estado actual **ya es** el previo (12 `INACTIVO`, 9 `OBSERVADO`, 1 `OBSERVADO_SPONSOR`). No se escribe nada |
| `EXCLUIDO_POR_DECISION` | 19 | Ver arriba |
| **`REVISAR`** | **2** | **Restaurar sí pisaría algo — ver abajo** |

**350 de los 371 se pueden tratar sin perder nada** (328 con restauración real + 22 sin escritura).

Dos precisiones metodológicas que cambiaron el resultado:

- **Los documentos inactivos no cuentan.** `findByUserIdWithHistory` filtra siempre
  `statusDocument: true`, así que un documento observado pero inactivo no influye en el estado del
  participante. Sin ese filtro el script marcaba 7 conflictos falsos (p. ej. `73969031`, cuyo
  `UNITED JO` está observado desde el 13/7 pero inactivo — y el cron le venía calculando
  `PREPARACION` sin problema desde entonces).
- **Restaurar un estado que ya es el actual no es restaurar.** Los 12 `INACTIVO` que el cron ya
  devolvió a su sitio no necesitan escritura alguna, solo la reversión del documento.

### Los 2 casos que NO se pueden restaurar a ciegas

**`70710164` — Alessandra Girao.** Estado previo `PENDIENTE_REVISAR`. El caso **ya lo resolvió el
equipo**: hoy 11/8 a las 16:48–16:51 UTC Andrea Gutierrez lo revisó, le dejó una observación de
participante vigente ("deberás actualizar la información de tu nuevo pasaporte en tu Sponsor
Application"), observó el documento con su propio texto, y **el participante subió un pasaporte
nuevo** — el documento está ahora en `SUBIDO`. Restaurarle `PENDIENTE_REVISAR` contradiría la
observación vigente, y revertir el documento borraría el pasaporte nuevo del historial.
→ **Excluir por completo**, igual que los 12 ya trabajados. Sube el total a **13 documentos tocados**.

> Su observación, además, quizá no era un falso positivo: nació el 24/6/2007 y el pasaporte se emitió
> el 21/10/2018 — a los 11 años. Es un pasaporte de menor, probablemente vencido. La regla acertó acá
> por casualidad, con el motivo equivocado.

**`70644102`.** Estado previo `PREPARACION`, hoy `PENDIENTE_REVISAR` — lo movió `254b56f1` a las
17:15:57 UTC, **mientras se escribía este documento**. Restaurar `PREPARACION` pisaría ese cambio.
→ **Excluir**, o restaurar solo el documento y dejar el estado quieto.

### ⚠️ El inventario se mueve por horas — esto no es teórico

Durante esta sesión de análisis (≈1 h) cambiaron **tres** casos:

```
11:48 Perú  inventario inicial   → documentos: OBSERVADO 359 · REVISADO 8 · SUBIDO 4 · 12 tocados
11:49 Perú  Andrea revisa a Alessandra (70710164), el participante sube pasaporte nuevo
12:15 Perú  alguien mueve a 70644102 a PENDIENTE_REVISAR
12:20 Perú  inventario recalculado → documentos: OBSERVADO 358 · REVISADO 8 · SUBIDO 5 · 13 tocados
```

Por eso el script de ejecución **tiene que recalcular el inventario en vivo y abortar si algo no está
donde lo dejó esta validación**. Los números de este documento son una foto del 11/8 ~17:20 UTC, no
una lista para ejecutar a ciegas.

### Qué NO se borra en ningún caso

Para que la garantía sea explícita, la reversión solo elimina **las filas que escribió la propia
corrida**:

1. `UserDocumentHistoryEtiquetas` de los historiales de la IA
2. los `UserDocumentHistory` de la IA (371 filas, todas identificadas por su `id`)
3. la fila de `UserHistoryStatus` que creó la corrida por cada participante

**No se borra ningún documento** (`UserDocuments` solo cambia de `status`), **no se toca S3**, y
**ningún historial anterior o ajeno se elimina** — incluidas las filas del cron y las de las personas
que trabajaron después. Como el 5/8, cada fila borrada se guarda entera en el log en disco, así que
se pueden reconstruir sin recurrir al backup.

**Consecuencia a aceptar explícitamente (P10):** al restaurar el estado y borrar solo la fila de la
corrida, las filas del cron que reafirmaron `OBSERVADO` los días 8, 9 y 10 **se quedan en el
historial**. El estado del participante quedará en `PREPARACION` mientras su historial muestra
`OBSERVADO` esos tres días. No se pierde nada, pero el rastro queda raro.

---

## 6. 🔴 PREGUNTAS QUE BLOQUEAN LA EJECUCIÓN

> **P1 a P4 resueltas el 11/8** — ver §5-bis. Restaurar el estado exacto previo; no tocar los 12 ya
> trabajados; de los 12 ya observados, revertir 5 y excluir los 2 de prueba y los 5 `INACTIVO`.
> Quedan abiertas las de abajo.

**P10. Las filas del cron que reafirmaron `OBSERVADO` los días 8, 9 y 10** quedan en el historial
después de restaurar el estado (§5-bis, "Qué NO se borra"). ¿Se aceptan tal cual?
- **(a) Dejarlas.** *Recomendado*: no se borra nada que no haya escrito la corrida. El rastro queda
  algo confuso, pero es fiel a lo que pasó.
- (b) Borrar también las reafirmaciones del cron posteriores a la corrida. Deja el historial limpio,
  pero elimina filas que el cron escribió legítimamente.

**P11. Los 2 casos de §5-bis (`70710164`, `70644102`): ¿se excluyen del todo?**
- **(a) Excluirlos por completo** (ni documento ni estado), sumándolos a los 19 ya excluidos → **21**.
  *Recomendado para `70710164`*, cuyo participante ya subió un pasaporte nuevo.
- (b) Revertir solo el documento y dejar el estado quieto. Viable para `70644102`, cuyo documento
  sigue intacto en `OBSERVADO`.

**P5. La regla de mayoría de edad genera el 98 % de las observaciones (364/371). ¿Es correcta?**
No bloquea la reversión, pero sí bloquea que el API se pueda volver a usar. Un pasaporte emitido
antes de los 18 años es válido; si lo que el negocio necesita es "mayor de edad **hoy**" o "mayor de
edad al inicio del programa", la regla actual está mal y hay que corregirla antes de la próxima
corrida.

**P6. ¿Cómo se evita la tercera corrida?** El endpoint sigue expuesto a cualquier Administrador y no
hay confirmación previa ni modo dry-run. Opciones: quitarlo del frontend, exigir un parámetro
explícito de confirmación, o dejarlo solo-lectura (que genere el Excel sin escribir observaciones).
*La última es la más útil: el reporte es valioso, las escrituras automáticas son las que causan daño.*

### Operativas

**P7. `mysqldump` antes de escribir.** Tablas: `UserDocuments`, `UserDocumentHistory`,
`UserDocumentHistoryEtiquetas`, `UserHistoryStatus`, `User`. **Sin respaldo no se ejecuta nada.**
¿Lo hace infraestructura o desde esta máquina? (Existe `prisma/backup-database.ts`.)

**P8. Ventana horaria.** El sistema está en uso activo (hubo trabajo humano el 10 y 11/8) y los
conflictos crecen con las horas: el 8/8 eran 79 limpios, hoy 12 documentos ya fueron trabajados.
Conviene una ventana de baja actividad y avisar al equipo.

**P9. ¿Se avisa al equipo de que no usen la etiqueta "Observado por IA" a mano?** Quedó pendiente del
5/8 y ya volvió a pasar el 7/8 (§5).

---

## 6-bis. Fase 3 — el script de ejecución ya existe (`revert-ia2-03-aplicar.ts`)

Escrito el 11/8 con las decisiones de §5-bis encodificadas. **`--dry-run` por defecto: sin `--apply`
no escribe nada.** Todavía NO se ha ejecutado con `--apply`.

### Plan del último dry-run (11/8 ~17:25 UTC)

```
A revertir:                348
  con escritura del estado del participante: 326
  sin escritura (ya está en su estado previo): 22
Excluidos por decisión:     21
Omitidos por verificación:   2
                          ────
Total:                     371

Status de documento a restaurar:    REVISADO 340 · OBSERVADO 5 · SUBIDO 3
Estado de participante a restaurar: PREPARACION 127 · ENVIADO_SPONSOR 79 ·
                                    DOCUMENTOS_INCOMPLETOS 78 · PENDIENTE_REVISAR 22 ·
                                    DOCUMENTOS_SUBIDOS 20

Escrituras: 348 DELETE etiquetas · 348 DELETE historial · 348 UPDATE doc.status ·
            348 DELETE UserHistoryStatus · 326 UPDATE user.status
```

### La deriva ya se está comiendo casos, y el script la absorbe

Ese dry-run **omitió 2 participantes que la validación de hace una hora daba como seguros**:

| DNI | Qué pasó |
|---|---|
| `70426023` | alguien lo puso `EN_REVISION` — ni estado observado ni su estado previo (`PREPARACION`) |
| `73883268` | su documento pasó a `REVISADO` a las **17:17:43 UTC**, minutos antes del dry-run |

Es exactamente el comportamiento buscado: en vez de escribir sobre trabajo ajeno, los deja fuera y
los reporta. Cada corrida omitirá los que hayan derivado desde la anterior, así que **el número final
de revertidos será algo menor que 348** y hay que mirar la lista de omitidos al terminar.

### Garantías implementadas

- **`--dry-run` por defecto**; solo escribe con `--apply` explícito.
- **`--limit N`** para una corrida canario (p. ej. `--apply --limit 5` sobre 5 filas antes de las 348).
- **Inventario en vivo**, nunca desde `inventario.json`. **Aborta** si no encuentra exactamente 371
  observaciones (cambio estructural).
- **Una transacción por fila**, con **re-verificación dentro de la transacción** (status del documento
  e historiales posteriores) inmediatamente antes de escribir. Una fila que falla no arrastra al resto.
  *Se desvía del "lotes de 200" del 4/8 a propósito:* con semántica de omisión por fila, una
  transacción por fila es más simple y no mantiene locks largos sobre tablas en uso.
- **Log en disco con el contenido completo de cada fila borrada** (`revert-ia2-03-aplicado.json`),
  suficiente para reconstruirlas sin el backup.
- **`process.exit` al final** — el proceso quedaba colgado al terminar en la reversión del 5/8.

### Lo que falta para poder ejecutar

1. ⬜ **`mysqldump`** de `UserDocuments`, `UserDocumentHistory`, `UserDocumentHistoryEtiquetas`,
   `UserHistoryStatus`, `User` (P7). **Sin esto no se ejecuta.**
2. ⬜ Ventana de baja actividad + aviso al equipo (P8).
3. ⬜ Corrida canario `--apply --limit 5` y verificación manual en el frontend antes de las 348.

---

## 7. Artefactos generados (⚠️ contienen DNIs)

`/reversion-ia-2` ya está en `.gitignore` (se agregó el 11/8 junto con este documento).

```
reversion-ia-2/inventario.json               ← detalle fila por fila, 371 filas
reversion-ia-2/inventario-reversion.xlsx     ← lo mismo, revisable a mano
reversion-ia-2/inventario-consola.txt        ← salida completa del inventario
reversion-ia-2/clasificacion-conflictos.txt  ← desglose de los 292 conflictos (§3)
reversion-ia-2/validacion-estados.json       ← veredicto por participante (Fase 2, §5-bis)
reversion-ia-2/validacion-estados.xlsx       ← lo mismo, revisable a mano
```

### Scripts nuevos (SOLO LECTURA)

```bash
npx ts-node -r tsconfig-paths/register prisma/<script>.ts [args]
```

| Script | Para qué |
|---|---|
| `inspect-corrida-07-08.ts` | Establece la firma de la corrida: etiqueta IA por día/autor, historiales `OBSERVADO` recientes, ráfagas de cambios de estado, correos |
| `revert-ia2-01-inventario.ts [excel] [carpeta]` | **Fase 1.** Inventario completo + cruce contra el Excel del reporte |
| `revert-ia2-02-validar-estados.ts [carpeta]` | **Fase 2.** Veredicto por participante: ¿se pierde algo al restaurar su estado previo? |
| `inspect-casos-conflictivos.ts [dni...]` | Radiografía de un participante: observaciones, todos sus documentos con historial, y estados — marcando qué es anterior y qué posterior a la corrida |
| `inspect-autor-corrida.ts` | Identifica los autores de las escrituras |

**Script de ejecución (el único que escribe, y solo con `--apply`):**

| Script | Para qué |
|---|---|
| `revert-ia2-03-aplicar.ts [--apply] [--limit N]` | **Fase 3.** La reversión. Sin `--apply` es dry-run |

Los scripts del incidente del 4/8 (`revert-ia-0*.ts`) siguen sirviendo como referencia, pero **no se
pueden reusar tal cual**: filtran por la etiqueta sin acotar autor ni ventana, así que barrerían
también las 15 filas del 4/8 y las 2 observaciones manuales.

---

## 8. Próximo paso concreto

1. ✅ Fase 1 — inventario, cruzado contra el Excel (cuadra exacto).
2. ✅ Fase 2 — validación de estados: 348 revertibles sin perder nada, 21 excluidos, 2 derivados.
3. ✅ P1–P4, P10 y P11 cerradas (§5-bis).
4. ✅ Fase 3 — `revert-ia2-03-aplicar.ts` escrito y probado en dry-run.
5. ⬜ **`mysqldump` (P7) — bloquea la ejecución.**
6. ⬜ Ventana de baja actividad + aviso al equipo (P8, P9).
7. ⬜ Canario `--apply --limit 5`, verificar en el frontend, luego la corrida completa.
8. ⬜ Escribir `revert-ia2-04-verificar.ts` (equivalente al `revert-ia-05-verificar.ts` del 4/8) y
   pasarlo después de aplicar: cero historiales de la corrida sobrevivientes, documentos y
   participantes en el estado esperado.
9. ⬜ Resolver P5 (la regla de mayoría de edad) y P6 (cómo se evita la cuarta corrida).
