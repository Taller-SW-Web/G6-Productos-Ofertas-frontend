# Seguridad H5 de Frontend

`preflight.json` registra el baseline observado; contiene solo identificadores y puertas, no credenciales. Los resultados locales son L0/L1 y no acreditan G7, Azure ni Vercel.

## Comandos reproducibles

- `node --test scripts/h5/security/*.test.mjs`: parsers, JWT sintético y fixtures negativas. Gitleaks se marca `BLOCKED_TOOL` si no está instalado.
- `node scripts/h5/security/gitleaks-scan.mjs repository` y `node scripts/h5/security/gitleaks-scan.mjs diff <BASE_SHA_40>`: Gitleaks real con salida redactada; el diff requiere commits accesibles y que los archivos nuevos estén añadidos al índice. No se registran valores detectados.
- `node scripts/h5/security/sca-audit.mjs`: `npm audit --json`; error de red o salida inválida es `INCONCLUSIVE`. Clasifica alcance según `package-lock.json`; si no puede determinarlo se considera desconocido, no desarrollo.
- `node scripts/h5/security/sarif-check.mjs <reporte.sarif> <SHA_40> <success|cancelled>`: exige ejecución exitosa, formato y SHA. No activa CodeQL.
- `node scripts/h5/security/bundle-check.mjs <directorio-build>`: escaneo limitado por patrones; no sustituye un gestor de secretos ni prueba ausencia universal.
- `npx playwright test --config tests/h5/security-playwright.config.ts`: pruebas en Chromium local. La configuración desactiva trazas, capturas y vídeo.
- `node scripts/h5/security/int06-runner.mjs`: fijar `G6_INT06_BACKEND_PATH`, opcionalmente `G6_INT06_EXPECTED_SHA`, y `G6_E2E_DOCS_PATH` a checkouts existentes; exige Docker para PostgreSQL descartable. El runner no modifica Backend ni SQL compartido.
- Tras generar los builds de prueba en `node_modules/.cache/security-mock` y `node_modules/.cache/security-api`, `node scripts/h5/security/generate-snapshot.mjs [snapshot.json] [manifest.json]` vuelve a ejecutar los verificadores locales y guarda solo estados y hashes. Si no se provee una ruta Backend, INT-06 queda bloqueado, no se inventa PASS.

La aplicación usa `VITE_DATA_MODE`, `VITE_G6_ADMIN_API_ENABLED`, `VITE_G6_READ_DEMO`, `VITE_G7_API_BASE` y `VITE_GATEWAY_ORIGIN` como configuración pública del cliente; ningún valor `VITE_*` es secreto. También existen variables `VITE_BULK_*` de otra guía, cuya aprobación y uso corresponden a su owner. No copiar tokens, claves, cookies ni connection strings a variables Vite, reportes o trazas.

CodeQL default setup y políticas GitHub no pudieron consultarse: 403, owner GitHub Admin. Gitleaks es una dependencia externa de herramienta y no se instala como dependencia productiva. CSP y CORS servidos por el host real requieren prueba autorizada; la fixture local no demuestra esa configuración. JWT, scopes y client_id del proveedor sintético no acreditan grants G7. El PR #79 sigue abierto y el workflow compartido no se toca desde esta rama.

Para ejecutar además la suite HTTP/PostgreSQL completa desde el generador, establecer `G6_RUN_TAXONOMY_HTTP=1`; si se omite, ese caso queda `NOT_RUN` en el snapshot sin invalidar evidencias previas independientes.

## Hallazgos históricos y cobertura de CI

`gitleaks-historico.json` registra los siete hallazgos `generic-api-key`, por archivo, commit y línea. El 2026-11-25, **Coordinación G6 / Auditoría G6** emitió la siguiente resolución formal:

> Dictamen de coordinación G6: las siete detecciones corresponden a falsos positivos por fixtures sintéticas. Los JWT contienen firmas ficticias, el JWE utiliza valores de relleno y los casos pertenecen a pruebas locales aisladas. No encontré credenciales reales en esos hallazgos.

La clasificación formal no altera el resultado bruto: el escáner mantiene su salida estricta y el historial sigue en `FAIL` mientras detecte los hallazgos. No se agrega ninguna allowlist.

En el [job E2E, parte 2](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/45508348798/job/138849573451), CI detectó seis archivos faltantes en los manifiestos y usó la distribución automática completa. El archivo `tests/h5/security-boundary.spec.ts` es uno de los specs recientes que deben incorporarse a la planificación; el ajuste definitivo de shards/manifiestos se coordinará después del merge del PR #79, sin modificar aquí el workflow compartido.

La suite histórica amplia de Playwright tuvo ejecuciones de 59/62 y 61/62, y la suite de auth 37/38; los casos fallidos pasaron en repeticiones aisladas. Son resultados intermitentes pendientes de investigación, separados del resultado local 7/7 de `security-boundary.spec.ts`; la repetición aislada no convierte las ejecuciones amplias en PASS.

Todas las pruebas de identidad, JWT, CORS y CSP locales son `L1_SYNTHETIC`: no validan grants G7 (`BLOCKED_G7`) ni las cabeceras reales de Vercel (`SERVER_HEADERS_NOT_VERIFIED`). Una cabecera observada en el proveedor sintético o Vite local no acredita el host desplegado.

## Integración CI H5

El escaneo histórico conserva el estado `HISTORICAL_SCAN_FAIL_REVIEWED`: el resultado bruto sigue en FAIL y el dictamen formal de Coordinación G6 / Auditoría G6 del 2026-11-25 clasifica las siete detecciones revisadas como fixtures sintéticas. No se configura ninguna allowlist ni se ocultan hallazgos. El escaneo del diff del PR se ejecuta de forma estricta y publica solo resultado redactado y SHA. Gitleaks 8.30.1 está fijado por SHA-256 del tarball Linux publicado.

El job de dependencias existente conserva su política de auditoría; `sca-audit.mjs <reporte> <decision>` interpreta sus archivos ya producidos sin lanzar un tercer npm audit. Informe ausente, inconsistente o con error se trata como INCONCLUSIVE. Los análisis de identidad/cabeceras locales son L1_SYNTHETIC y no validan G7 ni headers de Vercel.

`BLOCKED_GH_ADMIN`: la consulta del default setup de CodeQL devolvió HTTP 403; se requiere que un administrador compruebe su estado antes de activar o integrar otro workflow. No se declara CodeQL activo ni se instala uno duplicado sin esa comprobación. La integración con PR #79 y cabeceras reales quedan pendientes de coordinación.
