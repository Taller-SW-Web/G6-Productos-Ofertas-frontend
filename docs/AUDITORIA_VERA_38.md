# #38 — Precios y Auditoría, MK-013/014

Fecha: 2026-10-17 (America/Bogota). Rama exclusiva: `vera`.

## Base y fuentes

- `SOURCE_SHA` inicial: `2759c8d031b35e665432a9ca0f2a45c87943f072`, árbol limpio; sin cambios previos de Frontend.
- `AUDIT_MASTER_SHA` / base incorporada por fast-forward: `081065c86ac7e75f2d072f16b280373af1978d63`. No hubo conflictos ni reemplazo de historia.
- Docs local de solo lectura: `../Productos-y-Ofertas-docs`, rama `vera`, SHA `b640b7f65d920a12120c1e03540c0c13d2067309`. Sus carpetas reales son `specs/`, `hu/`, `flujos/`, `wireframes/`, `mockups/`; las rutas `../docs/ux/...` de AGENTS no existen en este workspace.
- Leídos: AGENTS, README, configuración y arquitectura reales; issue #38 y auditorías previas de MK-013/014; SPEC/HU/FLOW-013 y 014, WF-013/014; `mockups/{DESIGN.md,ux/propuesta-ux.md,ux/ux-decisions.md,ux/ux-guidelines.md}` y `mockups/MK-{013,014}/{component-spec.md,plan.md,tasks.md}`.
- `mockups/MK-{013,014}/validation-report.md` y `prototipo/*.html`: NO ENCONTRADOS. Los HTML de wireframes existen, pero no se usan como referencia visual final. Component specs siguen «En revisión»; no se declara aprobación UX.
- Docs contiene `tmp-expo-1.png` a `tmp-expo-4.png` sin seguimiento; se conservaron. No se editó Docs ni Backend.

## Aceptación y datos compartidos

El usuario confirmó en este chat dos decisiones: conectar edición de Pricing → asiento **simulado** de Auditoría; mantener la separación de datos del piloto Pricing respecto a Catálogo/Combos, con avisos y pruebas.

Una edición confirmada que cambia regular u oferta añade un asiento por importe modificado. Se conservan SKU de referencia, productId, motivo, antes/después sin convertir a float, reloj fijo del piloto y versión en el identificador de demo. Crear/retirar oferta mantiene los nulos y operaciones correspondientes. La variación de demo usa enteros exactos y trunca a cuatro decimales. No se genera asiento por una modificación únicamente de representación decimal, por validación fallida, cancelación o versión obsoleta. El actor `demo-pricing` es ficticio, con email/IP no informados. No se infiere moneda histórica ni identidad autenticada.

El registro vive en memoria del navegador hasta recargar, compartido solo por la composición **mock**. Las instancias aisladas de tests reciben su propio registro; los repositorios de Auditoría consultan una copia del registro actual en listado, detalle y conteo de exportación. El puerto público sigue siendo de solo lectura. No hay transporte AsyncAPI, deduplicación de broker, retención, persistencia ni auditoría real acreditados.

Programaciones e importaciones mantienen sus escenarios separados; el nuevo registro cubre ediciones de importes confirmadas. CSV/PDF siguen siendo muestras estáticas y se avisa que no representan necesariamente la consulta. Catálogo y Combos comparten su catálogo existente; las referencias de precio de Combos son independientes del piloto Pricing. No se inicializan precios de altas nuevas ni se escriben repositorios de otro owner. El reloj `2026-10-17T12:00:00Z` no se cambió.

## Hallazgos y reproducción

| ID | Estado / severidad definitiva | Pasos, observado y esperado | Resolución / regresión |
|---|---|---|---|
| VER-01 | REPRODUCIDO → CORREGIDO_Y_PROBADO, P1 para la aceptación acordada | `/precios/editar?target=base`, regular 279.90, motivo «Trazabilidad simulada VER-01», guardar/confirmar, menú Historial. Antes: «Precio actualizado», pero ninguna fila ZAP-TRL-EXP; test falla al buscar su detalle. Esperado: asiento simulado con el motivo confirmado. | Registro en memoria después de `records.push(saved)`; runtime mock de Auditoría lee ese registro. Test `VER-01/04: confirmed mock edit survives module navigation and appears in audit`; pasa tras el cambio, además comprueba actor, aviso y desaparición al recargar. |
| VER-02 | NO_APLICA como bug bajo el alcance aprobado; límite inter-MK confirmado | Consultar un SKU de Catálogo/Combos en el piloto no produce precio; los targets son fixtures explícitos y el reloj es fijo. Esperado aprobado: separación declarada, sin precios o SKU inventados. | Aviso de Pricing y README; test `VER-02: isolated Pricing targets do not fabricate prices for Catalog/Combos SKUs`: CAS-COR-001 conserva su referencia de Combos tras editar el piloto; Combos no inventa referencia ZAP-TRL-EXP. La suite de Catálogo/variantes/Combos conserva sus escenarios propios. |
| VER-03 | Estado de rama resuelto; ningún bug adicional de negocio confirmado | Incorporar master; revisar edición/versiones, vigencias, importación, filtros y CSV/PDF usando las suites existentes y el segundo adapter. | Fast-forward sin conflictos. Tests existentes de Pricing/Auditoría y suite inter-MK; nueva prueba consumidor-proveedor de precisión, nulos, filtros, rechazo y aislamiento; `VER-03: missing API providers fail closed for both features`. No se promociona el mock a API. |
| VER-04 | CORREGIDO_Y_PROBADO para la aceptación aprobada, P1 | Mismo recorrido VER-01; antes era un límite intencional documentado, no un bug automático. | Confirmación explícita del usuario; avisos dicen asientos simulados, sesión, actor ficticio y alcance. Regresión compartida con VER-01; reloj conservado. |
| VER-05 | NO_APLICA como eliminación presente de cobertura | Inspeccionar `.github/workflows/frontend.yml` después de sincronizar master. | El workflow conserva `verify-production.mjs mock`, `vercel-smoke.mjs`, `test:ci`, build API y verificador API. No se modificó ni se quitaron escenarios. Se añade al verificador el recorrido VER-01 y se amplía la detección de carga de mocks API para incluir `pricingChanges`. |

Las filas resueltas por código corresponden a `28cc9cf1f3ee659e67052c56f5f9af2ed811894f`; la entrega final añade documentación/evidencia y esperas explícitas en las pruebas para comprobar datos ya cargados. La reproducción inicial falló **una vez por ausencia de asiento**; el primer intento previo no pudo ejecutar Playwright mientras `npm ci` aún instalaba dependencias y no se cuenta como reproducción funcional.

## Pantallas, rutas y reutilización

| MK | Pantallas verificadas por las suites existentes |
|---|---|
| 013 | S01 `/precios`; S02 `/precios/editar`; S03 `/precios/programaciones`; S04 `/precios/importar`; S05 `/precios/importaciones/:batchId`; S06 `/precios/historico` |
| 014 | S01 `/precios/auditoria`; S02 detalle `/precios/auditoria/asientos/:auditId`; S03 mismo detalle inexistente; S04 `/precios/auditoria/exportar/csv`; S05 `/precios/auditoria/exportar/pdf` |

Se reutilizan PricingProvider, PricingPageFrame, AuditLayout, AuditTable, hooks/repositorios, FeedbackAlert y tema existentes. Sin componentes visuales, rutas, dependencias o endpoints nuevos; sin cambios de theme, roles/scopes o contratos externos. El cambio funcional reside en los adapters/composición mock, no en JSX. El aviso ampliado usa el mismo patrón Mantine/shared y tokens de DESIGN; no se añaden HEX ni variantes visuales.

## Archivos

- `src/features/pricing/adapters/mockPricingRepository.ts`: notificación opcional tras confirmar edición, sin modificar el puerto público.
- `src/features/pricing/mocks/createDemoPricingRuntime.ts`: conexión mock y aviso de alcance/aislamiento.
- `src/features/price-audit/mocks/pricingChanges.ts`: registro de sesión, mapping y variación exacta de demo.
- `src/features/price-audit/adapters/mockAuditRepository.ts`: consulta de asientos compartidos junto a fixtures en lectura/conteo.
- `src/features/price-audit/mocks/createMockAuditRuntime.ts`: composición del registro compartido y aviso de simulación.
- `tests/vera-integration.spec.ts`: cuatro regresiones de integración y contrato consumidor-proveedor.
- `scripts/verify-production.mjs`: recorrido productivo mock añadido y control de no cargar `pricingChanges` en API; conserva todas las vistas previas.
- `README.md`, este informe: aceptación, datos compartidos, límites y evidencia.
- `docs/evidencias/vera-38/{listado-1440.png,detalle-1440.png}`: evidencia visual nueva del recorrido en preview mock, sin reemplazar capturas históricas de otros owners.
- `docs/evidencias/vera-38/{suite-completa.txt,validaciones.txt}`: salida local completa de test:ci y verificaciones de tipos/lint/producción.

## Correcciones aplicadas para revisión de PR #46

Tras la auditoría técnica del PR #46, se aplicaron las siguientes correcciones y verificaciones:

1. **Estabilidad y Timeout de CI:**
   - La ejecución #39011739050 fue cancelada durante el paso de verificación API debido a que la suite completa (más de 290 pruebas E2E) consumió el límite histórico de `timeout-minutes: 15`.
   - Se ajustó `timeout-minutes: 30` en `.github/workflows/frontend.yml` para garantizar la ejecución holgada de todos los pasos (instalación, build mock, verifier mock, smoke, test:ci, build API y verifier API).

2. **Robustez ante fallo de callback `onUpdated`:**
   - En `src/features/pricing/adapters/mockPricingRepository.ts`, la invocación de `onUpdated?.(...)` se encapsuló en un bloque `try...catch`.
   - Un error o excepción en la notificación secundaria (auditoría o suscriptores externos) ya no impide que el precio comercial confirmado quede guardado y activo en el repositorio.
   - Verificado con la nueva prueba de regresión `VER-05: onUpdated callback failure after price save does not prevent update from succeeding`.

3. **Integración con Combos (Castilla PR #43):**
   - Se mantiene la prueba `VER-02` que comprueba el aislamiento de los fixtures base frente a SKUs de Catálogo/Combos.
   - Se añadió la prueba de regresión `VER-02-B: live PricingCombosAdapter pattern reflects pricing updates into Combos without stale snapshots`, validando que cuando Combos consulta el repositorio de Pricing en vivo, cualquier edición de precios confirmada se propaga de inmediato a Combos en unidades menores exactas.

4. **Compatibilidad con Catálogo (Poma PR #40):**
   - Se verificó la coexistencia en `createDemoPricingRuntime.ts`: Vera modifica `service` (inyectando `mockPricingAudit.record`), mientras que Poma modifica `updates` (añadiendo suscripción a `mockCatalogRepository.subscribe`).
   - Ambas implementaciones son ortogonales y se integran limpiamente sin sobrescribirse.

5. **Demo híbrida y coordinación de API de Precios:**
   - Se formalizó la delimitación en `docs/COORDINACION_PRICING_API.md`: Pricing preparado para API real (con fail-closed en `unavailableApiPricingRepository` mientras Castilla coordina la infraestructura HTTP central) y Auditoría en mock simulado en memoria.
   - Sin pantallas de login, tokens JWT inventados ni rutas no publicadas en OpenAPI 0.6.0.

## Validaciones

- `npm ci`: PASS, Node 22.21.0/npm 10.9.4, 207 paquetes instalados, cero vulnerabilidades informadas.
- `npx playwright test tests/vera-integration.spec.ts --reporter=line`: 6 PASS (VER-01, VER-01/03, VER-02, VER-02-B, VER-03, VER-05), 8.0 s.
- `npm run typecheck`: PASS, cero errores.
- `npm run lint`: PASS, cero advertencias/errores.
- `VITE_DATA_MODE=mock npm run build`: PASS, 7458 módulos en 2.78 s.
- `node scripts/verify-production.mjs mock http://127.0.0.1:5174`: PASS, 58 vistas y recorrido VER-01 verificado.
- `node scripts/vercel-smoke.mjs http://127.0.0.1:5174`: PASS, cinco rutas, refresh, cero errores.
- `VITE_DATA_MODE=api npm run build`: PASS, 7458 módulos en 3.22 s.
- `node scripts/verify-production.mjs api http://127.0.0.1:5174`: PASS, 53 vistas, providers ausentes explícitos y cero carga de mocks.
- `VITE_DATA_MODE=mock npm run build`: PASS, build de producción restablecido a mock para desarrollo/demo.

## Matriz de verificación

- [x] Fuentes y revisión Docs verificadas; pantallas/rutas reales identificadas.
- [x] Git inicial limpio, rama `vera`, cambios ajenos preservados.
- [x] TypeScript, builds mock/API, lint y pruebas configuradas ejecutados con PASS.
- [x] Desktop 1440 px, loading/empty/error, teclado/foco y estados sensibles cubiertos por la suite.
- [x] Sin HTTP nuevo en componentes, HEX arbitrarios, contratos, roles/scopes o estados externos inventados.
- [x] No se editaron Docs ni Backend; delimitación de demo híbrida documentada.
- [x] Robustez de callback `onUpdated` comprobada y regresión VER-05 agregada.
- [x] Integración live con Combos comprobada y regresión VER-02-B agregada.
- [x] Compatibilidad con Catálogo (Poma PR #40) asegurada sin sobreescritura.
- [ ] Revisión técnica humana y aprobación UX: pendientes de reauditoría en PR #46.

Estado de entrega: **MOCK_INTEGRATED / MOCK_ONLY** (Demo híbrida documentada), sin API_INTEGRATED ni VALIDATED.
