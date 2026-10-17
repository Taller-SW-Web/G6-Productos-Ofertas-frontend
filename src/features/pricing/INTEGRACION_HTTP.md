# MK-013 / MK-014 — entrega parcial de integración, 2026-10-17

**PARTIAL.** El adaptador HTTP se valida con respuestas de prueba explícitas.
La aplicación productiva todavía no está conectada al Gateway por el cliente
compartido. Ningún PATCH de esta entrega se presenta como persistido en una
base real. MK-014 permanece mock.

## Git y ownership

Frontend: rama `vera`, base de los commits de esta entrega
`97bdd1631238943d783e6effabb0cad9efc9ff1b`. El solicitante autorizó su publicación en `origin/vera`.
Su [PR #47](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/pull/47)
ya existía al comenzar; recibe los commits publicados en su rama `vera`.
No se fusionan #40 de Poma ni #43 de Castilla.

Backend: rama `vera`, inicio `3071a1a5687f4bdcf78cc7e561aa91e4e2550483`,
actualizada con autorización a `2970df90babf2c8caa1849b179b02918fc74a005`
más los commits de Pricing de esta entrega. Antes de publicar, el solicitante
abrió Docker y se repitió el harness obligatorio: 37 PASS, cero omisiones. Ver
`apps/pricing-svc/INTEGRACION_FRONTEND.md` en Backend para matriz de 13 operaciones,
fuentes, owners y condiciones de desbloqueo.

Cambios solo en `src/features/pricing/**`. `main.tsx`, `src/app/config/**`,
transporte común, Auditoría, Catálogo, Combos, Inventario e infraestructura no
se editan. No se crean ramas, hacen despliegues ni modifican credenciales.

## Archivos

| Archivo relativo a esta feature | Cambio |
|---|---|
| adapters/httpPricingRepository.ts | Respuesta nula con 200 es error; se exige el status contractual de confirmación. PATCH/POST malformados o cancelados después del envío quedan unknown. Bloquea dobles envíos concurrentes y posteriores a resultado incierto. Valida alcance/versión/valores confirmados antes del callback demo y soporta rechazo de callback asíncrono sin perder el precio confirmado. Valida identidad de lote y vigencia histórica. |
| adapters/httpPricingMapper.ts | Valida coherencia de oferta, vigencia, canal producto/global, paginación completa y contadores/filas de lote; conserva importes, null, moneda y versión. |
| adapters/httpPricingSafety.spec.ts | 34 casos adicionales de confirmación, cancelación, doble envío, DTO incompatible, alcance, paginación, contadores y composición del runtime API. |
| adapters/vitest.config.ts | Incluye ambas suites de adaptadores de Pricing. |
| pages/PricingPatternsPage.tsx | Conserva galería en mock; en API no monta ejemplos ni controles con datos de demostración. Usa el contexto global existente. |
| testing/pricing-http.html, testing/pricing-http.tsx | Harness local exclusivo de pruebas: usa páginas, runtime y adaptador HTTP de la feature. Catálogo y respuestas HTTP son fixtures explícitos. Inyecta Auditoría mock para verificar coexistencia. No es composition root de producción ni cliente compartido. |
| testing/pricing-http.browser.spec.ts | Cinco pruebas Chromium: lectura/503 con dato anterior marcado; PATCH y relectura; 409 y formulario conservado; Auditoría mock explícita; galería sin muestras en API. |
| testing/playwright.config.ts | Chromium 1440×900, un worker, sin retries; artefactos bajo test-results/pricing-http. |
| INTEGRACION_HTTP.md | Este contrato de integración, validaciones y limitaciones. |

El puerto `PricingRepository` y sus firmas se conservan. No se sustituyen sus
consumidores ni se introduce un adaptador alternativo de Combos.

## Punto exacto de integración de Castilla (#45/#109)

El factory existente admite el provider:

```ts
createPricingRuntime("api", {
  api: async () => createHttpPricingRepository({
    transport: sharedGatewayTransport,
    listCatalogTargets: authoritativeCatalogPricingTargets,
    channelIds: canonicalPricingChannelIds,
    // onUpdated opcional: solamente una anotación de demo con before/after conocidos.
  }),
});
```

Los nombres del ejemplo son puntos de inyección, no implementaciones existentes.
`PricingHttpTransport.request(path, {method, signal, headers, body})` devuelve
`Promise<Response>`; la ruta ya incluye `/api/v1`. El cliente compartido debe
entregar esa respuesta, propagar AbortSignal y evitar retries automáticos de
PATCH/POST. No se instala un segundo transporte productivo dentro de Pricing.
El fetch directo del harness es solo un doble de transporte de pruebas.

`authoritativeCatalogPricingTargets` requiere identidades, etiquetas y estado/
elegibilidad verificables por Catálogo; no se conecta a mocks. `listTargets`
falla explícitamente si esa dependencia no se inyecta. Retail exige la identidad
canónica del canal de escritura: no se inventa un ID desde su etiqueta.

Castilla conserva `src/main.tsx`, `src/app/config/**` y la composición hybrid.
Debe inyectar explícitamente un runtime mock en `AuditRuntimeContext` para
MK-014; no usar `createAuditRuntime("api")` como sustituto. La prueba local
demuestra que esa composición es posible; no la instala globalmente.

`onUpdated` se ejecuta únicamente tras PATCH confirmado/validado y lectura
anterior exacta. Su fallo, incluso asíncrono, no revierte el precio ni reenvía
PATCH. No crea asientos reales en price-audit-svc. Un resultado unknown no lo
invoca. Una programación incierta queda bloqueada para ese alcance durante la
vida del repositorio; leer la lista no autoriza por sí mismo a reenviarla. No
se promete idempotencia durable entre recargas del navegador.

## Pantallas y fuente de datos

La aplicación normal conserva su modo mock. El modo API productivo sigue sin
provider compartido; falla visiblemente y no recurre a fixtures.

| Pantalla | Qué se ejercitó | Disponibilidad real |
|---|---|---|
| CurrentPricePage | Mock existente; en harness, mapper/adaptador HTTP, oferta null, versión, desglose vacío y último dato marcado tras 503 | PENDIENTE_INTEGRACION: Catálogo + cliente común + DB |
| EditPricePage | Mock existente; en harness, PATCH contractual, confirmación, relectura y 409 conservando formulario | BLOCKED_CONTRACT para escritura real P-PRI-02; sin persistencia real acreditada |
| HistoricalPricePage | Regresión de mock/adapter alternativo; unit del cliente por SKU/at, sin agregar at al producto | BLOCKED_CONTRACT: contexto SKU/elegibilidad |
| PriceSchedulesPage | Regresión mock; unit de rutas/paginación y POST sin versión; protección ante resultado incierto | Lectura preparada, escritura BLOCKED_CONTRACT P-PRI-02 |
| ImportPricesPage | Regresión mock; prevalidación API rechazada explícitamente sin enviar archivo | BLOCKED_CONTRACT P-PRI-01/02; no hay método de admisión nuevo |
| PriceImportResultPage | Regresión mock; unit de lotes HTTP, errores, identidad y contadores; CSV solo recibido por HTTP | Lote existente preparado; reporte BLOCKED_CONTRACT P-PRI-01 |
| PricingPatternsPage | Comportamiento mock preservado; galería API sin controles/datos de ejemplo | Sin API inventada; ruta de desarrollo /foundation/pricing |
| MK-014 | Filtros, detalle, no encontrado, exportación simulada, paginación, navegación y estado desactualizado; coexistencia con Pricing API en harness | MOCK funcional; composición global hybrid pendiente de Castilla |

Las capturas `consulta-http-1440.png` y `precio-confirmado-http-1440.png` están
bajo `test-results/pricing-http/` y fueron inspeccionadas a 1440 px. Sus datos
son de prueba; no se presentan como evidencia de PostgreSQL o Gateway real.

## Fuentes normativas

Docs oficial `master@c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b`: OpenAPI
0.6.0-rc.1, blob `f64bfe9a097b2a0f74c2600988305443d92f640e`; AsyncAPI
0.6.0-rc.2, SPEC/HU/FLOW-013, DEC-F-001/006/009/012 y matrices. La copia local
de esas fuentes coincide por hash con los blobs remotos. También se leyeron
AGENTS, README, docs/COORDINACION_PRICING_API.md, contratos, puerto/runtime y
casos de uso Backend. No se modificó Docs.

La escala numeric(12,2) y el mapeo del canal Retail conservan las incompatibilidades
ya documentadas en COORDINACION_PRICING_API: rechazar importes no soportados sin
redondear ni cambiar unilateralmente OpenAPI. P-PRI-02 conserva GenericData sin
construcción normativa del hecho; los objetos vacíos de tests no lo resuelven.

## Validaciones ejecutadas

Los comandos se ejecutaron desde cada repositorio. En los checks finales se
usó Node compatible explícito: frontend 22.22.3 y backend 24.19.0. El Node global
24.11.1 produjo avisos de engines en instalaciones iniciales, no un cambio de
dependencias. No se aplicó npm audit fix ni se modificaron lockfiles de la feature.

| Repositorio / comando | Resultado real |
|---|---|
| Frontend npm ci | PASS; instalación inicial con aviso de engines del Node global |
| Frontend npm run typecheck | PASS |
| Frontend npm run lint | PASS |
| Frontend npm test | PASS: 60 (36 Combos + 24 Bulk); el script global no incluye Pricing |
| Frontend npx vitest run --config src/features/pricing/adapters/vitest.config.ts | PASS: 50 (16 existentes + 34 adicionales), sin omisiones |
| Frontend npx playwright test --config src/features/pricing/testing/playwright.config.ts --workers=1 --reporter=line | PASS: 5, sin retries ni omisiones; HTTP simulado explícitamente |
| Frontend npx playwright test tests/pricing.spec.ts tests/pricing-workflows.spec.ts tests/pricing-audit.spec.ts tests/price-audit.spec.ts --workers=1 --reporter=line | Primer ciclo: 60 PASS, 1 FAIL por timeout en carga inicial de Auditoría |
| Frontend npx playwright test tests/price-audit.spec.ts --grep 'MK-014 S01/S02' --workers=1 --reporter=line | PASS: el caso fallido, sin modificar su prueba; se conserva el resultado del primer ciclo |
| Frontend VITE_DATA_MODE=mock npm run build | PASS; variable configurada con sintaxis PowerShell |
| Frontend VITE_DATA_MODE=api npm run build | PASS; build no acredita provider conectado |
| Backend npm ci | PASS con lockfile de master y Node 24.19.0 |
| Backend npm test -- apps/pricing-svc | PASS: 214 |
| Backend npm test | Sobre master: 548 PASS, 1 timeout de Taxonomía con el paralelismo por defecto |
| Backend npm test -- --maxWorkers=1 --no-file-parallelism | PASS: 549, sin modificar Taxonomía ni sus pruebas |
| Backend npm run typecheck / lint / format:check / build:pricing-svc | PASS |
| Backend TypeScript estricto de todos los .ts de Pricing, incluidos tests | PASS tras tipar explícitamente los DTO; primera pasada detectó widening de enums y se corrigió sin casts |
| Backend PRICING_TEST_POSTGRES=1 npm run test:e2e -- apps/pricing-svc --reporter=verbose | Reejecución final PASS: 37, sin omisiones, con PostgreSQL 16.15 real. Primer intento falló al arrancar Docker (10 PASS y 27 no ejecutados por beforeAll). |
| Ambos git diff --check | PASS |

En PowerShell el modo de build se configuró con `$env:VITE_DATA_MODE='mock'`
o `'api'`, y PostgreSQL con `$env:PRICING_TEST_POSTGRES='1'`. No se ejecutaron
asignaciones con sintaxis POSIX como comandos independientes.

Los fallos de las nuevas pruebas de UI se corrigieron sincronizando la espera
con la navegación completada; no se debilitó una aserción sobre relectura.

## Diagnóstico inicial, verificación posterior y límites de entrega

Se levantaron Gateway y Pricing reales en loopback efímero, sin JWT y con demo
explícita. Con un puerto PostgreSQL deliberadamente inaccesible, readiness de
Pricing dio 503 y el provider de readiness de Gateway dio not_ready. El GET de
diagnóstico devolvió 503 sanitizado a través de Gateway. No se consultó un
producto existente: el identificador usado era una fixture negativa. Ese 503
**no demuestra una consulta real de precio ni que el endpoint esté operativo**.
No se usa como evidencia del E2E requerido. Al comprobar después el entorno,
no había listeners en los puertos habituales 3000/3002. Las aplicaciones del
diagnóstico se cerraron. Gateway no publica GET /health/ready; usa provider/CLI.

Después de abrir Docker se verificó una fixture real persistida de Pricing en
PostgreSQL aislado, usando el harness y rol runtime existentes. Readiness de
Pricing dio 200, el provider de Gateway dio ready para Pricing y el GET por
Gateway respondió 200 con 99.99 PEN, oferta null y versión 1. Se releyó la
persistencia y se cerraron procesos/contenedor de pruebas. Evidencia en Backend:
`apps/pricing-svc/test/evidence/frontend-gateway-postgres-read-2026-10-17.json`.
Esto acredita Gateway→Pricing→PostgreSQL; no React→cliente compartido. La fixture
no es publicación comercial de Catálogo. La evidencia DATA-003 sigue siendo
histórica y no acredita su estado comercial actual.

Docker queda resuelto. Pendientes: Poma/arquitectura entrega contexto
autoritativo; Castilla implementa #45/#109 e inyecta los providers; Vera/Marco
y consumidores aprueban P-PRI-01/02 y las fronteras de escritura. Son condiciones
específicas, no bloqueo total de las piezas internas de Pricing.

React→cliente común→Gateway→Pricing→PostgreSQL, hybrid global e integración
autenticada compartida: **PENDIENTES**. Homologación externa: **NO ACREDITADA**.
Oracle y Vercel: **NO EJECUTADO**. No se cierran issues, publica una integración
como definitiva, hace auto-merge ni se cambia infraestructura.
