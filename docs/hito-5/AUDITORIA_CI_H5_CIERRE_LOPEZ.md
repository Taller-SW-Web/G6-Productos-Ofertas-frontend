# Auditoría CI H5 — cierre técnico Frontend

La Coordinación G6 / Marco Castilla comunicó la aprobación técnica de la modernización de CI. Para el cierre técnico `c18165468759f447b9a17c5f46f0fea85cd39732`, [workflow_dispatch 46118218651](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/46118218651) y [pull_request 46120571498](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/46120571498) finalizaron en **SUCCESS**. La suite `api_real_aislada` acreditó 16/16 escenarios en el entorno aislado de ese cierre. El nuevo commit documental y su pin requieren checks asociados a su propio SHA.

El pin Backend es `a5329ffc42d2002f07147dc59dc4527a82e59196`; Docs se mantiene en `5f30802129ba4bbc0674dcc5878f10065f443118`. Los ocho skips del Playwright general, observados en la ejecución histórica identificada abajo, se clasifican en **un benchmark opcional** y **siete escenarios funcionales que constituyen deuda de certificación funcional**; no se declaran ejecutados.

| Archivo y título | Motivo y clasificación |
|---|---|
| `admin-performance.spec.ts`: benchmark opt-in navegador: rutas administrativas contra API controlada | `G6_PERF_HARNESS=1` ausente; benchmark opcional fuera del shard normal. |
| `catalog-http-real.spec.ts`: CAT real HTTP: Chromium carga Catalog, edita por UI, lee variantes y conserva evidencia de errores/reintento | Falta JWT local firmado del runner real; funcionalidad vigente que requiere su runner específico. |
| `promotions-gateway.spec.ts`: MK005/006/007: React → Gateway → Promotions → PostgreSQL, persistence and visible failures | Requiere `gateway.isolated.smoke.mjs` y PostgreSQL/TLS real; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: login real del cliente, CRUD por Gateway/PG, 409, recarga y logout | Requiere runner Gateway/PG/TLS y G7 sintético; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: MFA no accede al Gateway antes de verificar el código | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: JWT expirado rechazado por Gateway renueva una vez y consulta PG | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: refresh revocado devuelve al login sin bucle de reintentos | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: usuario CLIENTE recibe 403 real y no puede administrar cupones | Misma dependencia; funcionalidad vigente, runner específico pendiente. |

G7 y G5 son dobles sintéticos; no acreditan permisos ni servicios externos reales. Los escenarios con SDK simulado no acreditan conectividad, identidad ni RBAC de Azure. `verificacion-despliegue-vercel.yml` no tiene diferencias frente a la base comprobada.

## Histórico de iteraciones

Las referencias y resultados siguientes corresponden a las revisiones y fechas indicadas; no representan el estado actual.

# Auditoría CI H5 — Frontend (en curso)

Referencia de diagnóstico: `7937e0220f2220ce1b2ab7c7acd78d7499a3067a`;
[CI 46103270154](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/46103270154). El job API real aislada falló antes de ejecutar Playwright por permisos de lectura de `server.key` del servidor G5 sintético. Ningún escenario de esa suite queda acreditado por ese fallo.

El run histórico 46103270154 terminó en FAIL, incluido `validate`. Los shards E2E generales informaron: parte 1, 168 PASS y 2 SKIP; parte 2, 187 PASS; parte 3, 146 PASS; parte 4, 165 PASS y 6 SKIP. Estas cifras no acreditan las tres suites de API real.

## Clasificación de los ocho SKIP del run 46107757410

Recuperados de `blob-report/report.jsonl` de las partes 1 y 4. Son resultados del SHA `b787e9711c3a5a8f72dc0f5a872daa39fa853e7e`; no acreditan otra revisión.

| Archivo y título | Motivo y clasificación |
|---|---|
| `admin-performance.spec.ts`: benchmark opt-in navegador: rutas administrativas contra API controlada | `G6_PERF_HARNESS=1` ausente; benchmark opcional fuera del shard normal. |
| `catalog-http-real.spec.ts`: CAT real HTTP: Chromium carga Catalog, edita por UI, lee variantes y conserva evidencia de errores/reintento | Falta JWT local firmado del runner real; funcionalidad vigente que requiere su runner específico. |
| `promotions-gateway.spec.ts`: MK005/006/007: React → Gateway → Promotions → PostgreSQL, persistence and visible failures | Requiere `gateway.isolated.smoke.mjs` y PostgreSQL/TLS real; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: login real del cliente, CRUD por Gateway/PG, 409, recarga y logout | Requiere runner Gateway/PG/TLS y G7 sintético; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: MFA no accede al Gateway antes de verificar el código | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: JWT expirado rechazado por Gateway renueva una vez y consulta PG | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: refresh revocado devuelve al login sin bucle de reintentos | Misma dependencia; funcionalidad vigente, runner específico pendiente. |
| `promotions-session-gateway.spec.ts`: #78: usuario CLIENTE recibe 403 real y no puede administrar cupones | Misma dependencia; funcionalidad vigente, runner específico pendiente. |

Los prerrequisitos no aplican al shard mock: el caso Catalog requiere JWT firmado y datos de un Gateway aislado; `scripts/run-h5-int08-l1.mjs` lo invoca cuando recibe su configuración y el harness Backend `apps/catalog-svc/test/h5/int01-local-catalog.e2e-spec.ts` puede aportarla. Los casos de Promotions dependen del montaje Backend `apps/promotions-svc/test/gateway.isolated.smoke.mjs` y sus helpers `gateway-flow-checks.mjs` / `session-gateway-checks.mjs`. La existencia de esos runners no demuestra que hayan ejecutado estos siete casos en el CI final; se mantiene su acreditación pendiente.

El workflow fija los SHA de Backend y Docs y exige que coincidan antes de registrar evidencia. El SHA de Backend debe actualizarse si cambia el PR #310. La corrección de propietario TLS pasó en CI Linux. El validador Playwright falla ante reintentos, resultados incompletos, skips y conteos inconsistentes.

El pin de Backend publicado para esta revisión es `6dd66036baf675f8ee2197ab3cb9e9754a0d0886`; Docs permanece en `5f30802129ba4bbc0674dcc5878f10065f443118`.

Evidencia: [Actions 46107757410](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/46107757410), Frontend `b787e9711c3a5a8f72dc0f5a872daa39fa853e7e`, Backend `24dd02c872d444af69f86006c2a86f9aa1178246` y Docs `5f30802129ba4bbc0674dcc5878f10065f443118`: CI SUCCESS; API real aislada ejecutó 16/16 escenarios, sin omisiones. G7 y G5 son fixtures sintéticas; no certifica grants ni servicios externos. Los cambios locales posteriores requieren CI nuevo.

En la copia local con cambios sin commit: `npm test` PASS (Combos 239, Bulk 98, Inventory 132 + 8, Pricing 166, Taxonomy 111 y política release 35: 789 pruebas), y lint, typecheck y 75 pruebas focalizadas PASS. La ejecución local usó Node 24, mientras el proyecto exige Node 22; no reemplaza CI del HEAD publicado.

G7 local es sintético; no prueba grants reales. El resultado de escaneo de diff no acredita el historial completo. La API reportó cero alertas Code Scanning abiertas; la configuración predeterminada no pudo consultarse por HTTP 403. El workflow de Vercel no presenta diferencias respecto de master; no se ha desplegado.

El pin actualizado requiere un nuevo CI sobre el HEAD de Frontend que lo contenga. La ejecución anterior es histórica. El workflow protegido `verificacion-despliegue-vercel.yml` no presenta diferencias frente a `origin/master`.
