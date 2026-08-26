# Paquetes de descarga por sponsor — estado

> **¿Vas a retomar este trabajo?** Empezá por
> [`HANDOFF-paquetes-sponsor-continuar.md`](./HANDOFF-paquetes-sponsor-continuar.md), que tiene el
> estado, lo que falta y las trampas del entorno. Este archivo es el detalle técnico.

Mover las reglas que arman el ZIP que se le manda al sponsor de constantes en código a datos
administrables. Cuatro entregas; esto documenta dónde estamos y cómo se prende.

## Estado: entregas 1, 2 y 3 terminadas — la flag está PRENDIDA en testing

**En testing, la descarga masiva ya usa las reglas de la base.** `SPONSOR_PACKAGES_FROM_DB=true`
en el `.env` de testing. En cualquier otro entorno sigue apagada, y apagarla es una variable.

| Entrega | Contenido | Estado |
|---|---|---|
| 1 · Cimiento | Migración, modelo, seed replicador, motor detrás de flag, test comparador | ✅ hecha |
| 2 · Administración | Módulo `sponsor-package` con CRUD, preview, listado y formulario en el admin | ✅ hecha |
| 3 · Encendido | Flag prendida en testing, validación con DNIs reales, header de omitidos visible en la UI | ✅ hecha |
| 4 · Limpieza | Borrar constantes, base64 del sello y `SPONSOR_CODE_REQUIRES_VACATION_LETTER` del front | pendiente |

## Decisiones cerradas

- **Prioridad de resolución**: `sponsor + programa` le gana a `sponsor + país`.
- **Sin paquete que matchee**: se omite al participante con motivo; el lote sigue.
- **Permisos**: administrar solo ADMIN. Descargar no cambia — sigue con `STAFF_ROLES`.
- **Historial**: auditoría (`created_by_id` / `updated_by_id`) y duplicar. Sin versionado.
- **Alcance por programa y país**: se construye completo, se expone después. Arranca con un paquete
  genérico por sponsor, que es exactamente el comportamiento de hoy.

## Qué se agregó

### Base de datos

Migración `20260826120000_add_sponsor_packages`. Cinco tablas nuevas, **puramente aditiva**:
ninguna tabla existente se altera, así que revertir es dropear las cinco.

```
sponsor_packages
 ├── sponsor_package_inputs           (los adjuntos tipo VacationLetter)
 └── sponsor_package_outputs          (los archivos: ULETTER.pdf, PASSPORT.pdf…)
      ├── sponsor_package_output_sources   (qué documentos entran, y en qué orden)
      └── sponsor_package_output_stamps    (el sello)
```

Dos cosas que **no** son descuido:

- No hay `UNIQUE(sponsor_id, program_id, country_id)`. MariaDB considera cada `NULL` distinto, así
  que ese índice permitiría dos paquetes `(UNITED, NULL, NULL)` — justo el caso a impedir. La
  unicidad del alcance se valida en el use case (entrega 2).
- `sponsor_id`, `program_id` y `country_id` son `VARCHAR(191)`, no `VARCHAR(36)`: Sponsor, Program y
  Country usan el String por defecto de Prisma y MariaDB exige que la FK coincida exacto. Es la
  misma razón por la que `procesos` las declara así.

### Código

| Archivo | Qué hace |
|---|---|
| `sponsor-package/domain/*` | Entidad, enums, puerto del repositorio y `resolveSponsorPackage` (la escalera de especificidad, función pura) |
| `sponsor-package/infrastructure/persistence/*` | Mapper y repositorio Prisma — solo lectura por ahora |
| `user-documents/.../document-assembler.service.ts` | El ensamblado de archivos, extraído de `SponsorDocumentBuilder`. Lo comparten los dos caminos |
| `user-documents/.../sponsor-package-engine.service.ts` | El motor configurable |
| `user-documents/.../legacy-package-specs.ts` | Los cinco paquetes de hoy escritos en vocabulario de configuración. Puente entre el código viejo y el seed |
| `prisma/seed-sponsor-packages.ts` | Siembra los cinco paquetes replicando el comportamiento actual |
| `sponsor-package/application/services/sponsor-package-planner.service.ts` | Decide QUÉ lleva el paquete, sin bajar archivos. Lo comparten el motor y el preview |
| `sponsor-package/application/use-cases/*` | CRUD, duplicar, reordenar y preview |
| `sponsor-package/application/validators/*` | Las reglas que MariaDB no puede expresar |
| `sponsor-package/infrastructure/http/*` | Controller (solo ADMIN), DTOs y el pipe del sello |

`SponsorDocumentBuilder` conserva su API pública intacta y delega el ensamblado. Sus constantes
siguen ahí: son la referencia contra la que el test comparador verifica la paridad.

### Tests

`sponsor-package-parity.spec.ts` (21 tests) es el criterio de aceptación. Verifica dos cosas:

1. **Fidelidad del puente** — `LEGACY_PACKAGE_SPECS` describe exactamente lo que dicen
   `UNITED_OUTPUTS`, `INTRAX_OUTPUTS`, `CENET_OUTPUTS`, `ASPIRE_SIGLAS_ORDER` y las constantes
   `SEAL_*`. Si alguien toca una constante y se olvida del spec, falla.
2. **Paridad del motor** — con los mismos datos, el motor configurable produce los mismos archivos,
   con las mismas fuentes en el mismo orden, que el camino histórico. Incluye los casos de
   documentos faltantes.

`resolve-sponsor-package.spec.ts` (10 tests) cubre la escalera de especificidad.

`sponsor-package.validator.spec.ts` (19 tests) cubre las reglas que la base no puede garantizar:
unicidad de alcance con NULLs, tokens inválidos, fuentes que apuntan a dos cosas o a ninguna, sellos
sobre documentos que el archivo no incluye.

`sponsor-package.module.spec.ts` (2 tests) verifica que el grafo de inyección se arma y que no hay
ciclo entre `SponsorPackageModule` y `UserDocumentsModule` — el error que TypeScript no ve.

**Nota sobre `maxWorkers: "50%"` en la config de Jest.** `Test.compile()` instancia todos los
providers, y `PrismaService` abre un pool contra la base en su constructor: el spec de DI los
sustituye por dobles vacíos para no conectarse a nada. Aun así, con 12 CPUs Jest lanzaba 11 workers
compilando con ts-jest en paralelo y dejaba sin CPU a
`bulk-extract-passport-data.use-case.spec.ts`, que tiene reintentos por reloj real y timeouts de 15s.
Limitando los workers la suite pasa de 205s a ~40s **y** queda verde.

## La pantalla del admin

Sidebar → **Documentos → Paquetes por sponsor** (`/sponsor-package`), bajo el guard `admin-strict`.

- **Listado** con filtros por sponsor, programa, país, estructura y estado. Acciones por fila:
  editar, probar con un DNI, duplicar y desactivar.
- **Formulario** en cuatro bloques: identidad y alcance, estructura y nombres (con vista previa en
  vivo de las plantillas), archivos de salida (reordenables, con sus fuentes y su sello) y adjuntos.
- **Probar con un DNI**: muestra el árbol que la descarga produciría y por qué falta cada cosa. Usa
  el mismo `SponsorPackagePlanner` que el motor, así que lo que muestra es lo que realmente saldría.

Los selectores de programa y país existen pero arrancan deshabilitados en «Todos», según lo decidido.

## Validación con datos reales (entrega 3)

Dos scripts nuevos, los dos de solo lectura sobre la base (sí bajan archivos de S3):

```bash
npm run compare:sponsor-packages -- --por-sponsor=8
npm run smoke:bulk-download -- --dnis=60775795,73056147,60991200,72691014
```

**`compare:sponsor-packages`** compara los **dos** endpoints de descarga con archivos reales de S3:
mismas rutas, mismas páginas por PDF, mismo tamaño con 2% de tolerancia (los metadatos de pdf-lib
cambian entre corridas, el contenido no). Es lo que el test de paridad no puede cubrir: tu S3 y tus
PDFs reales, con sus extensiones que no corresponden y sus archivos corruptos.

- **Masiva**: instancia los dos caminos a la vez, sin pasar por la flag.
- **Individual**: ejecuta el caso de uso REAL dos veces alternando `SPONSOR_PACKAGES_FROM_DB`. Así
  se cubre también la rama del `execute` — reconstruir ese camino a mano en el script taparía
  justamente un error de cableado. Compara nombre del archivo, content-type y contenido, y trata
  como paridad que los dos fallen con el mismo mensaje (un participante sin documentos tiene que
  seguir dando 404, no un ZIP vacío).

La subida del VacationLetter a S3 se anula durante la comparación: es un efecto de lado, no lógica,
y no tiene sentido ensuciar `aag-vacation-letters/` con archivos de prueba. Las descargas siguen
siendo reales. **El script no escribe nada, ni en base ni en S3.**

Resultado en testing: **30 de 30 participantes idénticos en las dos descargas**, 6 por sponsor,
incluyendo un CENET con los 6 archivos (que ejercita el `ARCHIVO_ORIGINAL` del PHOTO) y un caso que
produce 0 archivos (donde los dos caminos fallan igual).

El comparador se verificó inyectándole una falla —quitarle un archivo al lado configurable— y
confirmando que la detecta y nombra el archivo exacto. Un comparador que no puede fallar no sirve
como criterio de aceptación.

**`smoke:bulk-download`** ejecuta el caso de uso real —el mismo que llama el controller, con la rama
de la flag— e imprime el árbol del ZIP y los omitidos. Es la verificación de que la palanca está
conectada, no solo de que el motor funciona.

## Los omitidos ahora se ven

El backend siempre devolvió `X-Skipped-Participants`; el front nunca lo leía y la descarga avisaba
"Documentos descargados correctamente" aunque faltara media lista. Con las reglas ya administrables
eso pasaba de molesto a peligroso.

Ahora la descarga masiva abre un diálogo con quiénes quedaron fuera, agrupados por motivo y con un
botón para copiar los DNIs. Tres detalles que costaron encontrarlos:

1. **Un lote sin nadie con documentos responde 404**, y eso tiraba abajo la descarga entera: los
   lotes ya bajados se perdían. Ahora un lote fallido se registra y se sigue; solo se falla si
   ninguno aportó nada.
2. **Cuando fallan todos, los omitidos se publican igual antes de lanzar el error.** Es justo el caso
   donde saber quién quedó afuera más importa —una regla mal editada que excluye a todos— y perder
   esa lista dejaba un "ningún participante tiene documentos" sin nombres.
3. El motivo por DNI viaja en un header que la respuesta de error no trae, así que en un lote fallido
   se nombra a los participantes con el mensaje del error en vez de inventar una causa por cada uno.

## Los adjuntos ya son configurables de verdad

Se podía crear un adjunto en el admin, pero tres lugares seguían con `vacationLetter` fijo y el
adjunto nuevo nunca llegaba. Ahora:

- **El controller acepta cualquier campo**: `AnyFilesInterceptor()` en vez de
  `FileInterceptor('vacationLetter')`. El `fieldname` del multipart **es** el slug del adjunto.
- **La validación sale de la configuración**, no de constantes: el tipo y el tamaño los define cada
  adjunto en `sponsor_package_inputs`. No puede ser un pipe — un pipe corre antes de saber qué
  paquetes intervienen —, así que se valida en el caso de uso con los requisitos ya resueltos.
  `ParseOptionalPdfPipe` se borró; su validación vive ahora en los helpers del camino histórico,
  para que con la flag apagada el comportamiento siga siendo exactamente el de antes.
- **El front pregunta qué pedir**: `GET /sponsor-packages/required-inputs?sponsorCodes=…` devuelve
  qué sponsors tienen paquete y qué adjuntos piden. Es el único endpoint del módulo abierto a todo
  `STAFF_ROLES`, porque lo consume la pantalla de descarga.

Se borraron las tres listas que el front mantenía a mano: `SPONSOR_CODE_REQUIRES_VACATION_LETTER`,
`SPONSOR_CODES_WITH_DOWNLOAD` y el tope de 15 MB del diálogo. Las tres quedaban desactualizadas en
cuanto alguien configuraba algo nuevo — que es justo lo que ahora se puede hacer.

`BulkVacationLetterDialog` y `DownloadSponsorDocumentDialog` se reemplazaron por `BulkInputsDialog`
(N campos, uno por adjunto) y `DownloadSponsorDocumentButton` (se muestra solo si el sponsor tiene
paquete, y pide adjuntos solo si el paquete los pide).

**Verificado de punta a punta** creando un adjunto de prueba con un slug distinto
(`seguroMedicoPrueba`, 3 MB, opcional) y confirmando que aparece en el endpoint, que el tope de la
configuración se aplica (rechazó 4 MB) y que el tipo también (rechazó `text/plain`). El adjunto de
prueba se borró y se verificó que la base quedó como estaba.

Esto cierra también el desajuste de tamaño: el tope ya no es una constante duplicada, sale de
`sponsor_package_inputs.max_size_mb` en los dos lados.

## Cómo se prende

```bash
# 1. Aplicar la migración
npx prisma migrate deploy

# 2. Ver qué se sembraría, sin escribir nada
npm run seed:sponsor-packages

# 3. Sembrar
npm run seed:sponsor-packages -- --apply

# 4. Activar
#    .env → SPONSOR_PACKAGES_FROM_DB=true
```

El seed **falla sin escribir nada** si algo no resuelve: un sponsor que no existe, una sigla sin
documento activo, o —el caso peligroso— una sigla con más de un documento activo. Ese último es el
que hoy resuelve mal `findFirst`, y sembrar "casi todo" dejaría una regla apuntando a un documento
arbitrario sin que nadie se entere.

Para volver atrás: `SPONSOR_PACKAGES_FROM_DB=false`. Es una variable, no un rollback.

## Diferencias conocidas entre los dos caminos

Ninguna afecta qué archivos salen ni qué contienen. Son las tres:

1. **Motivo de omisión de AAG sin adjunto.** El camino histórico dice *"El sponsor AAG requiere
   adjuntar el PDF de VacationLetter"*; el configurable dice *"Falta el documento requerido
   `vacationLetter`"*. Mismo comportamiento, distinta redacción.
2. **Saneado del nombre del participante.** El camino histórico no sanea `buildBaseFilename`: un
   apellido con `/` crearía una carpeta. El configurable saneaba todos los tokens. Solo puede diferir
   con nombres que hoy producen un ZIP roto.
3. **Sponsor no soportado.** Antes era una lista fija de cinco códigos; ahora es "no tiene paquete
   configurado". Con los cinco sembrados, el conjunto de omitidos es el mismo.

## Pendiente antes de la entrega 3

- El front **nunca lee `X-Skipped-Participants`**. El backend devuelve el motivo por DNI y
  `participant.repository.ts` solo lee `content-disposition`. Con reglas administrables esto pasa de
  molesto a peligroso: si una regla mal armada excluye medio lote, hoy nadie se entera.
- **Límite de tamaño desalineado** en el VacationLetter: el diálogo del front acepta 15 MB y
  `ParseOptionalPdfPipe` rechaza sobre 10 MB. Se resuelve cuando el límite venga de
  `sponsor_package_inputs.max_size_mb`.
