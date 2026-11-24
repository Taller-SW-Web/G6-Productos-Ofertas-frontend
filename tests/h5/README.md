# H5 Frontend: suites contractuales y performance

Las pruebas H5 son opt-in. `int08.contract.pw.ts` y `perf06.pw.ts` usan el sufijo `.pw.ts`; la configuración ordinaria `playwright.config.ts` solo descubre `**/*.spec.ts`. La configuración INT-08 especial selecciona `catalog-http-ui.spec.ts` y `h5/int08.contract.pw.ts`. La última lista de Playwright descubrió 19 casos en esos archivos; el wrapper no fija un total, compara discovered/executed en cada corrida y exige cero fallos, skips, timeouts e interrupciones. Su reporter publica IDs por caso y estados allowlisted, sin mensajes, stacks, headers ni bodies. Playwright no conserva screenshots, HAR, video, trace ni attachments. Las capturas manuales del contrato UI se desactivan únicamente con `playwright.h5-int08-contract.config.ts`.

## Fixtures independientes

Frontend usa `tests/fixtures/h5/catalog/manifest.json`, `manifest.sha256` y `source.json`. La suite ordinaria no consulta otro checkout: la copia versionada, el checksum calculado sobre bytes exactos, la semilla `20261123` y el commit Backend de procedencia se validan localmente. La prueba de sincronización crea un repositorio Git temporal, lee el blob desde el SHA indicado con `git show` y comprueba igualdad byte a byte; no necesita Azure, credenciales G7, Supabase ni una carpeta Backend adyacente.

```powershell
node --test tests/fixtures/h5/catalog/manifest.test.mjs
node scripts/sync-catalog-h5-fixtures.mjs --backend-repo <ruta-repositorio-backend> --source-commit <sha-backend> --check
```

El segundo comando es una comprobación cruzada opcional. Si el manifest Backend cambia, hay que regenerar la proyección mediante el mismo comando sin `--check`, revisar los bytes y el nuevo `source.json`, y ejecutar nuevamente las pruebas antes del commit final de Frontend. No se cambia la proyección con solo recomputar su hash local: la procedencia debe coincidir con el blob del commit Backend fijado.

## INT-08 contractual y L1

```powershell
node --test tests/h5/evidence-security.test.mjs
node scripts/run-h5-int08-contract.mjs
node scripts/run-h5-cache-cdp.mjs
```

La suite contractual usa únicamente mocks de contrato y el harness local `catalog-http.html`, con `serviceCalls=0`. Cubre sesión ausente, JWT vencido/401 con limpieza/logout, rol incorrecto/403, DTO malformado, timeout HTTP, retry 503, carga parcial y refresh consistente; conserva los casos preexistentes de HTTP 202 no terminal, precio y disponibilidad. Escribe `test-results/h5/int08-contract-summary.json` y su índice externo luego de validar bytes. El wrapper captura stdout/stderr en memoria y publica estado/conteos por escenario, nunca la salida cruda. El probe Chromium comprueba dos lecturas del mismo recurso local vía CDP, con petición fría seguida de caché warm y evidencia 1/1, sin `page.route`.

La integración L1 se activa aparte:

```powershell
node scripts/run-h5-int08-l1.mjs
```

Requiere `G6_H5_INT08_ISOLATED_HARNESS=1`, JWT sintético emitido por el harness local, identidad negativa sintética, origen Browser en loopback y los IDs SKU/producto/variante descartables que consume `tests/catalog-http-real.spec.ts`. Si falta uno, genera `BLOCKED_DEPENDENCY`, termina con código 2 y no inicia Playwright ni servicios. Su configuración limita descubrimiento a `catalog-http-real.spec.ts`, desactiva screenshot/trace/video y usa el reporter allowlist. Los logs de página solo cuentan errores y métodos/rutas sin query; no imprimen URLs, headers ni textos de excepción.

El escenario de release real se mantiene en una pista L2 independiente descrita en `tests/h5/int08-l2-release-plan.mjs`; no se descubre en CI ordinaria. Sus pasos son login G7 autorizado, lectura de Catalog mediante APIM y verificación de `202` como admisión no terminal hasta el GET normativo de estado. La evidencia L2 incluye alias/hash del hostname, SHA de release/Gateway/servicio, correlation ID, alias de identidad, HTTP status y categoría de autorización, nunca URL privada ni credenciales. El preflight devuelve `WAIT_C_G7_APIM` con cero llamadas; solo P7 podrá ejecutarlo con release e infraestructura autorizados.

## PERF-06 — sesiones de navegador

Se ejecuta un `node scripts/run-h5-perf06.mjs` por sujeto, perfil, repetición y modo de caché. `scripts/run-h5-perf06-pair.ps1` automatiza la pareja completa. Sus argumentos son SHA Backend/Frontend ya verificados, un Gateway de prueba local, una carpeta de autenticación sintética de solo lectura, el índice de identidades y una carpeta local de evidencias:

```powershell
.\scripts\run-h5-perf06-pair.ps1 `
  -BaselineSha <sha-master-frontend> `
  -CandidateSha <sha-candidato-frontend> `
  -StorageStateDirectory <carpeta-segura-de-sesiones> `
  -IdentityIndex <carpeta-segura-de-sesiones\identity-index.json> `
  -ApiOrigin http://127.0.0.1:<puerto-gateway-aislado> `
  -ServiceSha <sha-backend-del-servicio> `
  -ReportRoot <carpeta-local-de-reportes> `
  -ColdOracleProvider <script-powershell-del-owner>
```

El script exporta los SHAs baseline y candidato con `git archive` a carpetas temporales independientes (sin clon ni worktree), los identifica mediante `.h5-subject-sha` y ejecuta `npm ci` con el lockfile de cada sujeto y genera una build de producción; Playwright sirve cada build con `vite preview`, no con el servidor de desarrollo. El SHA del harness es el `HEAD` limpio desde el que se ejecuta la herramienta; se registra por separado de ambos SHA de sujeto. El mismo código harness, dataset y configuración ejecutan los dos sujetos. Se rechaza un harness sucio, sujetos ausentes, un lockfile faltante o cualquier origen que no sea HTTP loopback. Los requests del navegador solo pueden ir al origen de la aplicación local o al Gateway aislado; otros orígenes se bloquean y hacen fallar el escenario. `-ColdOracleProvider` es opcional; si se proporciona, debe ser un script PowerShell del owner con interfaz `-ApiOrigin -SubjectSha -ServiceSha -Profile -Repetition -OutputPath`, que reinicia o desactiva la caché únicamente en el servicio local descartable y escribe una atestación reciente por ejecución. El objeto `proof` replica esos campos de caché y procedencia; su SHA-256 se calcula sobre JSON UTF-8 sin BOM, claves ordenadas recursivamente, sin sangría y con LF final. El validador recalcula ese hash y rechaza prueba alterada. La atestación debe declarar issuer `POMA_H5_DISPOSABLE_SERVICE_HARNESS`, `cacheState=COLD`, `serviceCacheState=RESET|DISABLED`, alias de instancia, SHA de servicio, SHA de sujeto, hash del origen API, hora UTC y `proofSha256`. El wrapper captura su salida y no la imprime. El validador acepta la atestación antes de copiarla a `ReportRoot/cold-attestations/`; su SHA se guarda en el índice externo. Si falta provider o la atestación no es válida, cold queda `INCONCLUSIVE` y warm continúa de forma independiente. La identidad de sesión llega como storage state, sin navegación de login; Chromium limpia su HTTP cache antes de medir. Los hits del navegador o de Service Worker invalidan cold; la caché del servicio solo se declara fría con la atestación del harness. Las comparaciones por perfil y caché se indexan en `comparisons/evidence-index.json`, separado de los JSON medidos; ningún archivo exige contener su propio checksum.

El directorio de sesiones contiene `session-001.json` hasta el máximo de usuarios del perfil. `identity-index.json` tiene forma `{"schemaVersion":1,"sessions":[{"session_id":"session-001","identity_alias":"POMA_H5_USER_001","authorization":"catalog-read","storage_state_sha256":"<sha256-bytes-exactos>"}]}`. Cada sesión debe tener un alias único, un archivo de estado distinto cuyo SHA coincida y una autorización sintética `catalog-read`. El único `identityLabel` publicado es `POMA_H5_SYNTHETIC_READONLY`; no se publican alias, tokens ni contenidos del estado.

Los perfiles son 1 sesión/60 s, 5 sesiones/180 s y 20 sesiones/300 s; tres repeticiones por sujeto y perfil, en cold y warm. La prueba usa un BrowserContext y una página por usuario, crea contextos antes de la barrera, mide el inicio desde la primera solicitud de navegación real y exige una dispersión máxima de 500 ms. Reutiliza cada contexto durante todo el perfil y mide el recorrido UI completo `/precios` → navegación “Gestión de productos” → listado → búsqueda UI por `sku_base` → fila filtrada → detalle que confirma `product_id`/SKU Base → “Ver preparación” con tarjetas de Pricing e Inventario → breadcrumb “Productos” y retorno a la fila. Los tiempos de cada etapa y de recorridos completos se registran junto con solicitudes/bytes por etapa, errores HTTP, errores JS, fallos/cancelaciones, recuentos y denominadores. No se interpreta el número de workers Playwright como usuarios.

Cold precarga autenticación desde storage state sin ejecutar login, abre contextos nuevos, limpia el HTTP cache de cada Chromium y mide la primera navegación. Por sujeto/perfil/repetición el owner del harness genera un JSON de atestación cuyo issuer es `POMA_H5_DISPOSABLE_SERVICE_HARNESS`, `cacheState` es `COLD`, `serviceCacheState` es `RESET` o `DISABLED`, y que incluye alias de instancia, SHA del servicio, SHA del sujeto, hash del origen API, hora UTC reciente y SHA de prueba. El runner rechaza ausencia, antigüedad mayor a 15 minutos o discordancia de cualquiera de esos campos como `INCONCLUSIVE`. Hits de disco/memoria o respuestas de Service Worker durante la ventana invalidan cold. Warm precalienta una vez las mismas rutas sin incluirlas en métricas, conserva esos contextos y exige al menos un hit observado en caché durante la ventana medida. Ningún modo bloquea Service Workers ni modifica la autenticación. Resultados warm pueden conservarse aunque cold sea inconclusive.

El runner emite JSON sanitizado con SHA de sujeto, lockfile, harness, dataset, origen API (solo fingerprint), Chromium, Node, CPU/memoria, perfil de red local, región, modo de caché, sesiones simultáneamente activas, dispersión de inicio, duración mínima efectiva y métricas. El estado medido requiere que todas las sesiones hayan navegado, se hayan solapado efectivamente, hayan permanecido activas al menos el 95 % del perfil y comiencen con dispersión máxima de 500 ms. El agregador requiere exactamente tres repeticiones con provenance y entorno coincidentes, calcula medianas y escribe el formato `admin-browser-performance.json` consumido por `scripts/compare-admin-performance.mjs`. El comparador H5 ejecuta ese comparador existente y publica un índice externo con SHA-256 de las seis comparaciones. La evaluación queda `INCONCLUSIVE` cuando no hay cambio funcional entre baseline y candidato. PERF-06 usa tiempo p95 y throughput de recorridos completos como experiencia de usuario, mantiene RPS/solicitudes/bytes como métricas separadas y aplica el gate de RPS solo si las solicitudes por recorrido difieren como máximo 5 %. Si cambia más, anota `HTTP_REQUEST_PATTERN_DIFFERS_RPS_GATE_NOT_COMPARABLE` y no da PASS/FAIL sistémico.

La ejecución L1 requiere los valores anteriores más `G6_H5_PERF06_PROFILE=1|5|20`, `G6_H5_PERF06_REPETITION=1|2|3`, `G6_H5_PERF06_CACHE_MODE=cold|warm`, `G6_H5_PERF06_SUBJECT_ROLE=baseline|candidate`, `G6_H5_PERF06_SUBJECT_SHA`, `G6_H5_PERF06_HARNESS_SHA`, `G6_H5_PERF06_SERVICE_SHA`, `G6_H5_PERF06_DATASET_SHA`, `G6_H5_PERF06_EVIDENCE_ROOT`, `G6_H5_PERF06_ISOLATED_HARNESS=1`, `G6_H5_PERF06_IDENTITY_LABEL=POMA_H5_SYNTHETIC_READONLY`, `G6_H5_PERF06_NETWORK_PROFILE=LOCAL_LOOPBACK`, `G6_H5_PERF06_READ_ONLY_ATTESTATION=1`, `VITE_GATEWAY_ORIGIN=<mismo-origen-loopback>`, `VITE_DATA_MODE=api` y `VITE_G6_ADMIN_API_ENABLED=true`. El wrapper rellena las variables sujetas a baseline/candidato; para cold, `G6_H5_PERF06_COLD_ORACLE_PATH` apunta a la atestación recién emitida.

Si falta infraestructura, token sintético, identidad independiente, lockfile u origen loopback, el wrapper informa `BLOCKED_DEPENDENCY` sin iniciar servicios ni emitir llamadas. Si falta una atestación cold o no se valida el estado de caché, ese resultado es `INCONCLUSIVE`; warm puede ejecutarse y conservarse independientemente. Un perfil con medición inválida no se considera aprobado. No se ejecuta comparación ahora si candidato solo cambia pruebas; la referencia puede ejecutarse en una instalación local aislada cuando estén disponibles los owners y la autorización del harness.

## Comandos especiales de evidencia

La suite ordinaria no activa estos escenarios. Cada ejecución opt-in produce su propio resumen; omisión en CI ordinaria nunca equivale a PASS.

```powershell
# Fixtures versionados, sin repo Backend adyacente ni servicios externos.
node --test tests/fixtures/h5/catalog/manifest.test.mjs
node scripts/sync-catalog-h5-fixtures.mjs --backend-repo <repo-backend> --source-commit <sha-backend> --check

# INT-08 contractual L0 y probe CDP 1/1; requieren Node 22 soportado.
node scripts/run-h5-int08-contract.mjs
node scripts/run-h5-cache-cdp.mjs

# INT-08 L1 real aislado en loopback, solo con harnesses/identidades descartables autorizados.
node scripts/run-h5-int08-l1.mjs

# L2 G7/APIM: valida el bloqueo de certificación; no emite solicitudes.
node --test tests/h5/int08-l2-release-plan.test.mjs

# PERF-06 de solo lectura, por sujeto/perfil/repetición/modo cache.
node scripts/run-h5-perf06.mjs

# PERF-06 con mutaciones: validación contractual del plan y preflight fail-closed sin llamadas.
node --test tests/h5/perf06-mutation-plan.test.mjs
node scripts/run-h5-perf06-mutation.mjs

# Seguridad de artefactos y revisión de bundle productivo.
node --test tests/h5/evidence-security.test.mjs
npm run test:production:auth
```

Presupuestos del runner contractual: discovery 20 s, readiness de Vite 15 s, ejecución 110 s y máximo total 150 s. Probe CDP: discovery 15 s, readiness 15 s, ejecución 25 s y máximo total 45 s. En ambos, el timeout finaliza el árbol de procesos en Windows. Una versión Node distinta de 22 produce `BLOCKED_DEPENDENCY` antes de ejecutar; errores funcionales con Node 22 soportado quedan `FAIL`, no se convierten en bloqueo.
