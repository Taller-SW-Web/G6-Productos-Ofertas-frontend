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

## Validaciones

- `npm ci`: PASS, Node 22.21.0/npm 10.9.4, 207 paquetes instalados, cero vulnerabilidades informadas.
- `npx playwright test tests/vera-integration.spec.ts --reporter=line`: 4 PASS, 7.8 s.
- Repetición focalizada sobre las esperas finales: 4 PASS, 8.2 s.
- `npm run typecheck`: PASS después de corregir dos accesos de índice opcionales en el test nuevo. La primera ejecución detectó esos errores; no se ocultaron.
- `npm run lint`: PASS.
- `VITE_DATA_MODE=mock npm run build`: PASS, 7456 módulos, 3.05 s de Vite.
- `node scripts/verify-production.mjs mock http://127.0.0.1:5184`: PASS, 58 vistas anteriores conservadas y recorrido VER-01 añadido.
- Repetición final del verificador mock: PASS. Una ejecución intermedia, al endurecer la espera de carga, falló por buscar el motivo como texto exacto sin su etiqueta; se corrigió el selector a coincidencia del motivo dentro del detalle y se repitió el recorrido completo. No se atribuyó ese fallo a la app.
- `node scripts/vercel-smoke.mjs http://127.0.0.1:5184`: PASS, cinco rutas, refresh de Productos, 43 recursos JS/CSS, cero errores. Es smoke local de preview; no demuestra despliegue nuevo.
- `VITE_DATA_MODE=api npm run build`: PASS, 7456 módulos, 3.51 s de Vite.
- `node scripts/verify-production.mjs api http://127.0.0.1:5184`: PASS, 53 vistas; cero carga de mocks/bundles, incluido el nuevo registro de cambios.
- Se restauró el build final a `mock`: PASS, 2.62 s de Vite. No se cambió la configuración de Production.
- Visual 1440×900: capturas de **preview de producción mock** inspeccionadas; [listado](evidencias/vera-38/listado-1440.png) con asiento nuevo, aviso legible y sin overflow; [detalle](evidencias/vera-38/detalle-1440.png) en modal 640 px con cuerpo desplazable, motivo, importes y referencia de versión. El test nuevo comprueba retorno/cierre y geometría; las suites existentes cubren teclado, foco, estados y todas las Sxx.
- `CI=true VITE_DATA_MODE=mock npm run test:ci`: PASS, 36 unitarias de Combos + 24 de Bulk y **290 E2E (12.9 min)**, sin reintentos ni reducción de cobertura. Incluye Catálogo, Variantes, Combos, Inventario, Promociones, Taxonomía, Foundation, Pricing/Auditoría y las cuatro regresiones nuevas.
- Typecheck/lint finales: PASS; `git diff origin/master --check`: PASS tras retirar una línea vacía sobrante del test nuevo.

## Matriz de verificación

- [x] Fuentes y revisión Docs verificadas; pantallas/rutas reales identificadas.
- [x] Git inicial limpio, rama `vera`, incorporación de master sin conflictos y cambios ajenos preservados.
- [x] TypeScript, builds mock/API, lint y pruebas configuradas ejecutados con PASS.
- [x] Desktop 1440 px, loading/empty/error, teclado/foco y estados sensibles cubiertos por la suite; capturas nuevas inspeccionadas.
- [x] Sin HTTP nuevo en componentes, HEX arbitrarios, contratos, roles/scopes o estados externos inventados.
- [x] No se editaron Docs ni Backend; P0/limitaciones e integración MOCK_ONLY registrados.
- [ ] Revisión técnica humana y aprobación UX: pendientes. CI de la HEAD/candidato final y SHAs se vinculan en el PR, sin reutilizar resultados si avanza master.

## Pendientes y condición de revisión

Q-013-01/02 mantienen bloqueado el contrato de archivo/admisión parcial; Q-014-01 mantiene pendiente la moneda histórica. Sus fuentes/owners son los component specs citados: propuesta de Leonardo Vera y revisión contractual de Miguel Ángel Taco. No se cambiaron estas decisiones desde Frontend. Provider HTTP/auth, exportación real, bus y validación humana UX permanecen pendientes; no son pruebas de esta demo.

La revisión final debe comprobar BASE/HEAD y el candidato de merge publicados en el PR. Si avanza master, corresponde **REVALIDACIÓN_OBLIGATORIA**; no reutilizar estos resultados. El PR no autoriza merge ni despliegue; el coordinador verifica Production después del merge autorizado.

Estado de entrega: **MOCK_INTEGRATED / MOCK_ONLY**, sin API_INTEGRATED ni VALIDATED.
