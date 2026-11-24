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
