# HANDOFF — Paquetes de descarga por sponsor · CONTINUAR ACÁ

> **Archivo:** `gestordocs-back/docs/HANDOFF-paquetes-sponsor-continuar.md`
>
> **Empezá por acá si retomás este trabajo sin contexto previo.**
> Detalle técnico completo en [`ESTADO-paquetes-sponsor.md`](./ESTADO-paquetes-sponsor.md).
> El trabajo toca **dos repos**: `gestordocs-back` y `gestordocs-front`, ambos en la rama `testing`.

---

## 1. Qué se está haciendo y por qué

Las reglas que arman el ZIP que se le manda a cada sponsor (qué archivos salen, qué documentos
entran a cada uno, en qué orden, con qué nombre) vivían como constantes y una cadena de `if` en
`SponsorDocumentBuilder`. Agregar un sponsor o cambiar el orden de un PDF era un deploy.

Se convirtieron en **datos administrables** desde una pantalla nueva del admin, sin perder nada del
comportamiento anterior.

**El modelo tiene tres niveles:**

```
SponsorPackage            (la regla; alcance = sponsor + programa? + país?)
 ├── SponsorPackageInput          archivos que el staff adjunta al descargar
 └── SponsorPackageOutput         un archivo del ZIP: ULETTER.pdf, PASSPORT.pdf…
      ├── ...OutputSource         qué documentos entran, y en qué orden
      └── ...OutputStamp          el sello
```

---

## 2. Estado actual

**Entregas 1, 2 y 3 terminadas. Falta solo la entrega 4 (limpieza).**

| # | Entrega | Estado |
|---|---|---|
| 1 | Migración, modelo, seed, motor detrás de flag, test comparador | ✅ |
| 2 | Módulo `sponsor-package`: CRUD, preview, pantalla del admin | ✅ |
| 3 | Flag prendida en testing, validación con datos reales, omitidos visibles, adjuntos configurables | ✅ |
| 4 | Limpieza: borrar constantes y el base64 del sello | ⬜ pendiente |

### ⚠️ Cosas que ya están vivas

- **`SPONSOR_PACKAGES_FROM_DB=true`** en `gestordocs-back/.env`. **La descarga de testing ya usa las
  reglas de la base.** Apagarla es cambiar esa línea — no hace falta rollback.
- **La migración está aplicada** en la base de testing (`testdocs` en `161.132.45.31:3397`).
- **Los 5 paquetes están sembrados** (ASPIRE, UNITED, INTRAX, CENET, AAG), replicando exactamente el
  comportamiento anterior.
- **El PNG del sello está en S3**, en `sponsor-package-stamps/`.
- **Nada está commiteado.** Los 45 archivos tocados (24 back + 21 front) están en el working tree de
  las dos ramas `testing`. Si vas a commitear, mirá primero `git status` en los dos repos.

---

## 3. Lo que falta: entrega 4 (limpieza)

Borrar el camino histórico, que hoy convive con el nuevo:

- `sponsor-document-builder.service.ts`: las constantes `UNITED_OUTPUTS`, `INTRAX_OUTPUTS`,
  `CENET_OUTPUTS`, `ASPIRE_SIGLAS_ORDER`, `AAG_*`, `SEAL_*` y los métodos `buildXOutputs`.
- `sello-translation.constant.ts`: 113 KB de base64 en un `.ts`.
- La rama `executeLegacy` de los dos casos de uso de descarga y los helpers
  `extraerVacationLetterLegacy`.
- `legacy-package-specs.ts` y `sponsor-package-parity.spec.ts` (pierden sentido sin el camino viejo).
- La flag `SPONSOR_PACKAGES_FROM_DB` y su rama en los `execute`.

**No lo hagas todavía sin confirmarlo.** Mientras las constantes existan, apagar la flag devuelve el
comportamiento conocido en un deploy. La decisión del equipo fue dejar correr la flag prendida en
testing un tiempo antes de quemar ese puente.

### Otras cosas abiertas (decisiones, no deuda)

- **Alcance por programa/país**: el modelo y el motor lo soportan completo y está testeado
  (`resolve-sponsor-package.spec.ts`), pero los selectores del formulario están **deshabilitados en
  "Todos"** a propósito. Habilitarlo es sacar el `disabled` en `SponsorPackageForm.tsx`
  (prop `scopeEnabled`). Hoy hay un paquete genérico por sponsor, que es el comportamiento de siempre.
- **`PATCH /sponsor-packages/:id/outputs/order`** existe pero el formulario no lo usa: reordena por
  posición del array al guardar. Endpoint sin consumidor, inofensivo.
- **Auditoría**: se guarda `created_by_id` / `updated_by_id` pero no se muestra en ninguna pantalla.

---

## 4. Trampas del entorno — leé esto antes de tocar nada

| Problema | Qué hacer |
|---|---|
| **`npm run start` del backend no arranca** con `nest start`. `npm run build` sí funciona. | Levantarlo con `npx ts-node -r tsconfig-paths/register src/main.ts`, o `npm run build && node dist/src/main` |
| **No uses `export … from '@alias'`** (re-export con path alias). Rompe `nest build` con `Cannot read properties of undefined (reading 'checkJsDirective')`. Ver §7. | Importar y re-exportar por separado, o importar del módulo de origen |
| **Redis no corre** en el entorno de desarrollo. Login y descarga funcionan; el refresh token no. | Convivir con eso, o levantar un Redis en `localhost:6379` |
| **Las rutas son `/api/...`, NO `/api/v1/...`**. `enableVersioning()` nunca se llama, así que el `version: '1'` de los controllers se ignora. | No busques `/api/v1`; no existe |
| La base de testing es **remota** (`161.132.45.31:3397`, base `testdocs`). `NODE_ENV=production` en el `.env` a pesar de ser testing. | Cualquier script toca datos reales de testing |
| Jest tiene **`maxWorkers: "50%"`** en `package.json`. No lo saques. | Ver §7 |

---

## 5. Cómo verificar que no rompiste nada

```bash
# gestordocs-back
npx tsc --noEmit -p tsconfig.json
npx jest                                    # 240 tests, 23 suites — deben pasar TODOS

# Compara los DOS caminos con archivos reales de S3. No escribe nada, ni en base ni en S3.
npm run compare:sponsor-packages -- --por-sponsor=6

# Ejecuta la descarga masiva real (respeta la flag) e imprime el árbol y los omitidos.
npm run smoke:bulk-download -- --dnis=60775795,73056147,60991200,72691014

# gestordocs-front
npx tsc --noEmit -p tsconfig.app.json
npx vite build
```

### El criterio de aceptación

`compare:sponsor-packages` es **la** prueba que importa: corre el camino histórico y el configurable
sobre los mismos participantes reales y compara rutas, páginas por PDF y tamaño (2% de tolerancia —
los metadatos de pdf-lib cambian entre corridas, el contenido no). Si dice **DIFIERE**, algo se
rompió: no sigas.

Última corrida: **30/30 idénticos en las dos descargas** (masiva e individual), 6 por sponsor.

El comparador se verificó inyectándole una falla a propósito y confirmando que la detecta. No es un
verde vacío.

---

## 6. Mapa del código

### Backend — `gestordocs-back/src/modules/`

```
sponsor-package/                          MÓDULO NUEVO
├── domain/
│   ├── sponsor-package.entity.ts         el árbol de la regla
│   ├── sponsor-package.enums.ts
│   ├── sponsor-package.repository.ts     puerto (lectura + escritura)
│   ├── resolve-sponsor-package.ts        escalera de especificidad (función pura)
│   └── package-templates.ts              tokens {dni} {programa}… y saneado
├── application/
│   ├── services/sponsor-package-planner.service.ts   ⭐ decide QUÉ lleva el paquete
│   ├── use-cases/crud-sponsor-package.use-cases.ts
│   ├── use-cases/preview-sponsor-package.use-case.ts
│   ├── use-cases/find-required-inputs.use-case.ts    qué adjuntos pedir + validación
│   └── validators/sponsor-package.validator.ts       reglas que MariaDB no puede expresar
└── infrastructure/  persistence (mapper + prisma repo) · http (controller, DTOs, pipe del sello)

user-documents/application/services/
├── document-assembler.service.ts         bajar de S3, detectar formato, combinar, estampar
├── sponsor-package-engine.service.ts     le pone bytes al plan del planner
├── sponsor-document-builder.service.ts   CAMINO HISTÓRICO (muere en la entrega 4)
├── legacy-package-specs.ts               puente: los 5 paquetes viejos en vocabulario nuevo
└── sponsor-package-parity.spec.ts        21 tests: los dos caminos producen lo mismo
```

**El `SponsorPackagePlanner` es la pieza central.** Decide qué lleva el paquete sin bajar un byte.
Lo comparten el motor de armado **y** el preview del admin — a propósito: si el preview resolviera
por su cuenta mostraría un árbol que no es el que la descarga produce, y un preview que miente es
peor que no tener preview.

### Frontend — `gestordocs-front/src/`

```
core/domain/models/sponsor-package.ts     tipos espejo del backend
core/ports/sponsor-package.port.ts
infrastructure/repositories/sponsor-package.repository.ts
features/sponsor-package/                 pantalla del admin (tabla, filtros, formulario, preview)
features/participant/
├── components/BulkInputsDialog.tsx              pide N adjuntos según la config
├── components/DownloadSponsorDocumentButton.tsx descarga individual
├── components/SkippedParticipantsDialog.tsx     quiénes quedaron fuera y por qué
└── hooks/useDownloadRequirements.ts             qué sponsors tienen paquete y qué piden
pages/SponsorPackage/                     rutas /sponsor-package (guard admin-strict)
```

Sidebar → **Documentos → Paquetes por sponsor**.

---

## 7. Decisiones no obvias — no las deshagas sin leer esto

Cada una costó encontrarla. Si te parecen raras, el motivo está acá.

**`sponsor_id`, `program_id` y `country_id` son `VARCHAR(191)`, no `VARCHAR(36)`.**
`Sponsor.id`, `Program.id` y `Country.id` usan el String por defecto de Prisma. MariaDB exige que la
FK coincida exactamente con la columna referenciada. Es la misma razón por la que `procesos` las
declara así.

**No hay `UNIQUE(sponsor_id, program_id, country_id)`.**
MariaDB considera cada `NULL` distinto, así que ese índice dejaría pasar dos paquetes
`(UNITED, NULL, NULL)` — justo el caso a impedir. La unicidad del alcance se valida en el use case
(`assertScopeIsFree`).

**Las fuentes apuntan a `Documents.id`, no al string de siglas.**
`Documents.siglasCode` **no tiene índice único**. Resolver por sigla con `findFirst` toma un
documento arbitrario si hay dos activos con la misma. Por FK eso no puede pasar. El seed **aborta**
si detecta siglas duplicadas.

**Los adjuntos no se validan con un pipe.**
Un pipe corre antes de saber qué paquetes intervienen, y el tipo y el tamaño los define cada adjunto
en `sponsor_package_inputs`. Se validan en el caso de uso, con los requisitos ya resueltos. Por eso
se borró `ParseOptionalPdfPipe`.

**El controller usa `AnyFilesInterceptor()`.**
El nombre del campo del multipart **es** el slug del adjunto, que lo define el admin. Con
`FileInterceptor('vacationLetter')` un adjunto nuevo nunca llegaba.

**`maxWorkers: "50%"` en la config de Jest.**
Con 12 CPUs, Jest lanzaba 11 workers compilando con ts-jest en paralelo y dejaba sin CPU a
`bulk-extract-passport-data.use-case.spec.ts`, que tiene reintentos por reloj real con timeouts de
15s. Limitando los workers la suite pasa de 205s a ~40s **y** queda verde.

**El spec de DI sustituye `PrismaService`, `AwsS3Service` y `ResendService` por dobles vacíos.**
No es cosmético: `Test.compile()` instancia todos los providers, y `PrismaService` **abre un pool
contra la base real** en su constructor. Sin los overrides, el test se conectaba al servidor remoto
y tardaba minutos.

**Nunca uses `export { X } from '@modules/...'` (re-export con path alias).**
Rompe `nest build` con `Cannot read properties of undefined (reading 'checkJsDirective')`.

El hook `tsconfig-paths.hook.js` de `@nestjs/cli` reescribe los path aliases al emitir. Para los
`import` sintetiza nodos que funcionan bien, pero en la rama de `ExportDeclaration` el nodo nuevo
queda sin `parent`. Cuando el archivo además tiene una clase decorada que se referencia a sí misma
—como `new Logger(MiClase.name)`, que está por todo el proyecto—, TypeScript entra en
`trySubstituteClassAlias`, camina la cadena de `parent` para encontrar el `SourceFile`, obtiene
`undefined` y explota.

`npx tsc` no falla: el crash es exclusivo del hook de la CLI. El proyecto no tenía ningún re-export
con alias hasta que se agregó uno acá; se quitó. Si volvés a necesitarlo, importá y exportá en dos
pasos, o hacé que el consumidor importe del módulo de origen.

**El camino histórico se conserva intacto y sus constantes también.**
Son la referencia contra la que el test de paridad verifica que la configuración sembrada produce el
mismo resultado. Se borran en la entrega 4, no antes.

---

## 8. Si va a producción

**El orden no es negociable:**

```bash
# 1. Migración PRIMERO. Si el código sale antes, el listado revienta
#    contra tablas que no existen.
npx prisma migrate deploy

# 2. Dry-run del seed: no escribe nada y avisa si alguna sigla no resuelve.
npm run seed:sponsor-packages

# 3. Sembrar. Esto SÍ escribe, y sube el PNG del sello a S3.
npm run seed:sponsor-packages -- --apply

# 4. Recién ahora, desplegar el código con SPONSOR_PACKAGES_FROM_DB=false.

# 5. Validar con datos de producción antes de prender:
npm run compare:sponsor-packages -- --por-sponsor=8

# 6. Prender: SPONSOR_PACKAGES_FROM_DB=true
```

La variable **todavía no está en el `.env` de producción**. Sin definirla el default es `false`, que
es lo correcto, pero conviene ponerla explícita.

---

## 9. Qué conviene testear a mano

Lo que los scripts no pueden cubrir, porque eligen los primeros participantes de cada sponsor y no
buscan casos raros:

- Documentos con **formato engañoso**: un `.jpg` que en realidad es PNG, un TIFF, un PDF corrupto.
  El motor los detecta por magic bytes, no por extensión — vale confirmarlo con datos reales.
- Participantes con **expedientes incompletos** (el preview debería nombrar qué falta y por qué).
- La **descarga individual** desde el detalle del participante.
- Un **lote mixto** en la descarga masiva: que el diálogo de omitidos liste a los que quedaron fuera
  agrupados por motivo.
