# Reversión de las 245 observaciones automáticas del 4/8/2026

> **Documento de continuidad.** Escrito el 5/8/2026. Asume que quien lo lee **no tiene contexto
> previo**. El incidente completo (qué es el API, qué bugs se encontraron, qué se arregló) está en
> **`docs/PENDIENTE-revision-masiva-pasaportes.md`** — conviene leer al menos su sección 1 antes que
> esto.
>
> **Estado: Fase 1 (inventario) TERMINADA. Nada se ha escrito todavía en la base de datos.**
>
> **▶ Al retomar, empezar por la §6: son las preguntas que hay que hacerle al usuario antes de
> escribir una sola línea del script de ejecución.** Son 9, en orden de prioridad (3 bloqueantes, 3
> operativas, 3 de negocio), cada una con sus opciones y una recomendación.

---

## 1. Qué se quiere hacer

El 4/8/2026 se ejecutó por error `POST /api/v1/user-documents/revision-masiva-pasaporte`, que
**observó automáticamente 245 pasaportes**: creó un historial nuevo con status `OBSERVADO` y la
etiqueta *"Observado por IA"*, cambió el estado de cada participante y dejó registro en su
historial de estados.

**El objetivo es deshacer eso**: devolver documentos y participantes al estado exacto que tenían
antes de la corrida, sin perder historial legítimo ni documentos.

### Datos de la corrida

| Dato | Valor |
|---|---|
| Etiqueta "Observado por IA" | `6de02d0d-a5ef-40c7-8488-7cf604a16d43` |
| Ventana (UTC) | `2026-08-04 17:49:04.540` → `2026-08-04 21:46:43.830` |
| `created_by_id` de todas las escrituras | `d5165eff-2df4-4a87-a65e-3ea50cf4ad3d` |
| Corridas con esta etiqueta en otras fechas | **ninguna** — solo la del 4/8 |

### ⚠️ La base del `.env` local es PRODUCCIÓN

`161.132.45.31:3394`, base `docs26`. Cualquier script de este repo con el `.env` actual toca datos
reales. **Todo lo hecho hasta ahora fue solo lectura.**

### Qué escribió el API por cada observación (y cómo se revierte)

| # | Tabla | Cambio | Reversión |
|---|---|---|---|
| 1 | `UserDocumentHistoryEtiquetas` | fila con la etiqueta IA | borrar |
| 2 | `UserDocumentHistory` | fila nueva con status `OBSERVADO` | borrar |
| 3 | `UserDocuments` | `status` → `OBSERVADO` | restaurar al status del historial anterior |
| 4 | `UserHistoryStatus` | fila con `OBSERVADO`/`OBSERVADO_SPONSOR` | borrar |
| 5 | `User` | `status` → `OBSERVADO`/`OBSERVADO_SPONSOR` | restaurar al estado anterior |
| 6 | correo al participante | — | **no hizo falta: no se envió ninguno (ver §3)** |

La reconstrucción del estado previo es fiable porque **todo cambio de `UserDocuments.status` en el
código va siempre acompañado de una fila en `UserDocumentHistory`** (verificado en todo el
repositorio). El estado anterior es el de la fila inmediatamente anterior a la de la IA.

---

## 2. Resultado de la Fase 1 (inventario, ya ejecutada)

```
Historiales escritos por la corrida IA:  245   (todos del 4/8, un solo autor)
  Reversibles automáticamente:           236
  Con conflicto (revisión manual):         9
Correos enviados a participantes:          0
```

**Los 9 que fallaron por el `varchar(191)`** (ver el otro documento, §4.1) **no están entre estos
245**: su `INSERT` reventó y la transacción hizo rollback completo, así que no escribieron nada y no
hay nada que revertir para ellos. Guiándose por la BD quedan excluidos solos.

**Estados a restaurar en los documentos:** `REVISADO` 236 · `SUBIDO` 5 · `OBSERVADO` 4

**Estados a restaurar en los participantes:**

| Estado | Cantidad |
|---|---|
| PREPARACION | 90 |
| DOCUMENTOS_INCOMPLETOS | 68 |
| ENVIADO_SPONSOR | 45 |
| DOCUMENTOS_SUBIDOS | 14 |
| PENDIENTE_REVISAR | 14 |
| OBSERVADO | 8 |
| INACTIVO | 5 |
| OBSERVADO_SPONSOR | 1 |

**Artefactos generados** (contienen DNIs — **no commitear**, la carpeta no está en `.gitignore`):

```
reversion-ia/inventario.json            ← detalle completo, fila por fila
reversion-ia/inventario-reversion.xlsx  ← lo mismo, revisable a mano
```

---

## 3. Hallazgo importante: NO se envió ningún correo

Era lo único irreversible del incidente, y no ocurrió.

```
Acción DOCUMENTO_OBSERVADO: status = true (activa)
Plantillas asociadas:       0
Correos registrados desde el inicio de la corrida: 0
```

`EmailDispatchService.dispatchByActionCode` sale en `if (!template) return;` **antes de enviar y sin
registrar nada**. La acción está activa pero no tiene ninguna plantilla asociada, así que ninguno de
los 245 participantes recibió el correo de "documento observado". Los 33 registros históricos de esa
acción están todos en estado `OMITIDO` y el último es del 16/7, de otro flujo (correos programados).

> Efecto secundario a tener presente: **hoy el sistema no envía el correo de documento observado a
> nadie**, ni en las revisiones manuales. Si eso no es intencional, es un problema aparte que hay
> que reportar al negocio.

---

## 4. ⚠️ El sistema sigue en uso — esto condiciona la ejecución

Desde que terminó la corrida se crearon **48 historiales de documentos** y **117 cambios de estado**
de participantes. La última actividad registrada al momento de escribir esto es del **5/8 00:14
UTC**.

**Consecuencias:**

1. **Los conflictos crecen con el tiempo.** Los 9 actuales son gente que trabajó sobre esos
   participantes después de la corrida. Mañana pueden ser más.
2. **El script de ejecución NO debe confiar en `inventario.json`.** Tiene que **recalcular el
   inventario en vivo** en el momento de aplicar y **abortar** si encuentra diferencias con lo
   esperado.
3. Conviene ejecutar en una **ventana de baja actividad** y avisar al equipo.

---

## 5. Los 9 conflictos

### 5.1 Con el documento tocado después (4) — no se tocan ni el documento ni el estado

| DNI | Qué pasó después de la observación | Status actual del doc |
|---|---|---|
| 70496908 | subió un documento nuevo (`SUBIDO` @ 18:45) | SUBIDO |
| 70488760 | subió un documento nuevo (`SUBIDO` @ 23:52) | SUBIDO |
| 76016920 | subió un documento nuevo (`SUBIDO` @ 23:12) | SUBIDO |
| 70627745 | aceptación manual (`REVISADO` @ 22:07) — **con la URL perdida** | REVISADO |

**70627745 (Mariana Bocangel)** es el caso que destapó todo. Su documento
(`userDocumentId = a7733b6e-15e8-400e-8569-a0ad1054f551`) ya está en `REVISADO`, que era su estado
previo, pero el historial de esa aceptación quedó con `url = NULL` por el bug del fix 1. Su archivo
sigue intacto en S3:
`https://use-515504445665-us-east-1-an.s3.us-east-1.amazonaws.com/user-documents/bulk/bc68d9d2-3c79-41e3-8653-f4aa369bcbce.pdf`
**Se trata aparte:** restaurarle esa URL y borrar el historial de la IA.

### 5.2 Solo con el estado del participante movido (5) — el documento sigue intacto

`61144848`, `61345369`, `70959919`, `61335097`, `61143329`

Sus documentos siguen en `OBSERVADO` sin que nadie los haya tocado, así que **el documento sí se
puede revertir con seguridad**. Lo que no se puede es restaurar el estado del participante a ciegas,
porque alguien lo movió después (probablemente por otros documentos suyos).

---

## 6. 🔴 PREGUNTAS A HACER AL RETOMAR (bloquean la Fase 3)

> **Instrucción para quien retome esto: NO empieces a escribir el script de ejecución.** Empieza
> planteándole estas preguntas al usuario, una a una y con sus opciones, hasta cerrarlas todas. Sin
> estas respuestas cualquier script que se escriba va a estar adivinando decisiones que no son
> técnicas, sino del negocio. Las respuestas conviene anotarlas en este mismo documento.

### Bloqueantes — sin esto no se puede escribir el script

**P1. Los 5 participantes cuyo estado previo era `INACTIVO`: ¿los restauro a `INACTIVO`?**
DNIs: `71183524`, `71155531`, `73984442`, `70487231`, `73254293`.
La corrida los pasó de `INACTIVO` a `OBSERVADO`.
- **(a) Restaurar a `INACTIVO`** — fiel a su estado real antes de la IA. *Recomendado.*
- **(b) Dejarlos en `OBSERVADO`** y que el equipo los revise.
- **(c) Ponerlos en otro estado** que indique el negocio.

*Por qué se pregunta:* `INACTIVO` parece un estado especial (existe un
`findLastStatusBeforeInactive` en el código, lo que sugiere que se usa como baja temporal).
Devolverlos ahí es lo correcto en teoría, pero si esos participantes se reactivaron por otra vía,
restaurarlos los sacaría de circulación.

**P2. Los 5 conflictos "solo estado movido" (§5.2): ¿qué hago?**
DNIs: `61144848`, `61345369`, `70959919`, `61335097`, `61143329`.
Su documento sigue intacto en `OBSERVADO`, pero alguien movió el estado del participante después.
- **(a) Revertir el documento y dejar el estado del participante intacto** — *recomendado*, es lo
  más conservador: no pisa el trabajo de nadie.
- **(b) Revertir el documento y ejecutar `TerminarRevisionUseCase` solo para esos 5** — recalcula
  el estado correctamente según las reglas actuales, pero puede dejarlos en un estado distinto del
  que tenían.
- **(c) No tocarlos** y que el equipo los revise a mano.

**P3. Los 4 documentos que YA estaban `OBSERVADO` antes de la IA: ¿confirmas que vuelvan a su
observación anterior?**
DNIs: `72622168`, `12345666`, `74528656`, y `70496908` (que además es conflicto).
Al borrar el historial de la IA vuelven a la observación previa, que sigue vigente. Es lo
técnicamente correcto, pero significa que esos participantes **seguirán observados** después de la
reversión, y el equipo puede esperar lo contrario.

### Operativas — antes de aplicar

**P4. ¿Quién hace el `mysqldump` y cuándo?** ¿Desde esta máquina o lo hace infraestructura? Tablas:
`UserDocuments`, `UserDocumentHistory`, `UserDocumentHistoryEtiquetas`, `UserHistoryStatus`, `User`.
**Sin respaldo no se ejecuta nada.**

**P5. ¿Qué ventana horaria usamos?** El sistema está activo (§4) y los conflictos crecen con las
horas. Hace falta un rato de baja actividad y, si se puede, avisar al equipo para que no toquen
participantes mientras corre.

**P6. ¿Se despliegan antes los fixes 1 y 2?** Están hechos y verificados pero sin desplegar (ver el
otro documento, §3). No son requisito para la reversión, pero mientras no estén en producción cada
"aceptar" sobre un documento de carga masiva sigue borrando su URL.

### De negocio — conviene resolverlas, no bloquean

**P7. Los 6 pasaportes con mismatch REAL de content-type** (`61035475`, `73117424`, `61987492`,
`70720728`, `70627745`, `76459964`): su observación era correcta, sus archivos están realmente mal
guardados en S3 y 3 de ellos no se pueden ver desde el 3 de julio. Al revertir se borra esa señal.
¿Los revertimos igual y se corrigen aparte (recomendado), o se dejan observados?

> **Actualizado el 5/8/2026:** eran 5 en la versión original de esta pregunta. Al validar el fix 4
> contra la BD apareció **76459964**, que faltaba porque la lista se armó desde el Excel y ese
> participante es uno de los 9 que el Excel omitía. Las otras 22 observaciones por content-type
> siguen confirmadas como falsos positivos, sin cambios.

**P8. La acción de correo `DOCUMENTO_OBSERVADO` no tiene plantilla** (§3), así que **hoy ningún
participante recibe aviso cuando le observan un documento**, ni en las revisiones manuales. ¿Es
intencional? Si no, hay que reportarlo: es un problema independiente de este incidente.

**P9. ¿Qué se le comunica al equipo?** Durante ~12 horas 245 participantes estuvieron marcados como
observados y algunos fueron trabajados en ese estado. Después de revertir, el historial de esas
observaciones desaparece: quien haya visto una observación ayer no la va a encontrar hoy.

---

## 7. Fase 0 — PENDIENTE antes de cualquier escritura

**`mysqldump` de `docs26`** limitado a las tablas involucradas:

```
UserDocuments, UserDocumentHistory, UserDocumentHistoryEtiquetas, UserHistoryStatus, User
```

**Sin este respaldo no se ejecuta nada.** Falta definir quién lo hace (¿desde esta máquina o lo hace
el equipo de infraestructura?).

---

## 8. Fase 3 — Requisitos del script de ejecución (por construir)

`prisma/revert-ia-04-aplicar.ts`, todavía no existe. Debe cumplir:

- **`--dry-run` por defecto.** Imprime cada cambio (`id`, valor actual → valor a escribir) sin tocar
  la base. Solo escribe con `--apply` explícito.
- **Recalcula el inventario en vivo** (no lee `inventario.json`) y **aborta** si un documento o
  participante ya no está en el estado esperado.
- **Por lotes** (~200 filas), **cada lote en su propia transacción**.
- **Log fila por fila en disco** (antes/después) para auditoría y para poder rehacer.
- **NO re-ejecuta `TerminarRevisionUseCase`** en el camino normal: restaura los valores exactos. (La
  excepción sería la opción (b) de la decisión 2, solo para esos 5.)
- **Orden por cada elemento:**
  1. borrar `UserDocumentHistoryEtiquetas` del historial IA
  2. borrar el `UserDocumentHistory` de la IA
  3. `UserDocuments.status` = status del historial anterior
  4. borrar la fila de `UserHistoryStatus` creada por la corrida
  5. `User.status` = estado anterior

### Garantías que el script debe respetar

- **No se borra ningún documento.** `UserDocuments` nunca se elimina; solo se revierte su `status`.
- **No se toca ningún archivo en S3.** Cero operaciones sobre el bucket.
- **Solo se borran las 245 filas de historial creadas por la corrida**, identificadas por la
  etiqueta IA + ventana + `created_by_id`. Ningún historial anterior o ajeno se toca, y los IDs se
  listan antes de borrarse.
- **Los conflictos se excluyen automáticamente** y se listan aparte.

---

## 9. Fase 4 — Verificación posterior

1. Cero historiales con la etiqueta `6de02d0d-…` en la ventana.
2. Conteo de participantes por estado comparado contra lo esperado (§2).
3. Muestreo manual en el frontend de 5-10 participantes, incluyendo alguno de los que se restauran a
   `PREPARACION`, alguno de los 4 que vuelven a `OBSERVADO` previo, y Mariana (70627745).

---

## 10. Scripts disponibles (todos SOLO LECTURA)

```bash
npx ts-node -r tsconfig-paths/register prisma/<script>.ts [args]
```

| Script | Para qué |
|---|---|
| `revert-ia-01-inventario.ts [carpeta]` | **Fase 1.** Genera `reversion-ia/inventario.json` + Excel con todo el mapa de la reversión |
| `revert-ia-02-detalle.ts` | Desgloses finos sobre el inventario: INACTIVOs, ya-observados, conflictos, actividad del sistema |
| `revert-ia-03-correos.ts` | Comprueba si la corrida pudo enviar correos (acción + plantillas + log) |
| `inspect-participant-passport.ts <dni>` | Todos los documentos e historiales de un participante |
| `inspect-run-scope.ts` | Tipos reales de columnas en producción y alcance de la corrida por día |
| `inspect-run-crosscheck.ts <excel>` | Cruza las observaciones en BD contra el Excel del reporte |
| `inspect-null-url-scope.ts` | Documentos que quedaron sin URL, con su URL previa recuperable |

Todos son borrables cuando el incidente esté cerrado.

---

## 11. Próximo paso concreto

1. Obtener las 3 respuestas de la §6.
2. Hacer el `mysqldump` de la §7.
3. Construir `revert-ia-04-aplicar.ts` con los requisitos de la §8.
4. Correrlo en `--dry-run`, revisar la salida juntos.
5. Aplicar en ventana de baja actividad.
6. Verificar con la §9.
7. Después, retomar el resto del incidente (fixes 3, 4 y 5, y la reparación de los archivos de S3)
   desde `docs/PENDIENTE-revision-masiva-pasaportes.md`.
