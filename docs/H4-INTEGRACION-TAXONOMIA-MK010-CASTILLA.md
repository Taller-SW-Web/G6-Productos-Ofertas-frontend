# H4 — Integración Taxonomía MK-010 (Backend #41)

Fecha de auditoría: 2026-11-04. Estado: consumer frontend parcial; PR sucesora #67 abierta en borrador. No se afirma E2E desplegado.

## Trazabilidad y fuentes vigentes

| Referencia | SHA / estado | Evidencia |
| --- | --- | --- |
| Frontend base `master` | `095a591a3e096614e76b4d99e623ecbba43f6c1f` | Base sobre la que se recuperó el commit de López. |
| Frontend PR #65 | `715ae909b1fc8cf45598c863f787b284dd2367ec` | Commit original recuperado; no se usa como evidencia de integración Backend. |
| Recuperación original | `fddc6cb` | `cherry-pick -x`; conserva autoría y referencia al commit fuente. |
| Frontend PR #66 | `05c4b57a201a977231cac3d32db451c10f7710e7`; cerrada con enlace a #67 | Su rama remota `mrcastilla8/h4-taxonomy-41-integration` se conserva como respaldo. |
| Frontend sucesora | `feat/taxonomy-gateway`; HEAD vigente enlazado en la PR | PR #67, título `feat(taxonomy): integrar listado MK-010 vía Gateway`, abierta en borrador. |
| Backend `master` auditado | `5abfffc9b86306df87d19695817aa678588e0341` | Controlador, servicio SQL, guard, rutas Gateway, tests y migraciones leídos directamente en ese SHA. |
| Docs `master` vigente | `80f208978c2c703e2b2d62064112365e7b9e1677` | OpenAPI y acuerdo G1–G6 consultados en ese SHA. |

PR #66 y #67 comparten inicialmente el mismo HEAD `05c4b57`; la sucesora conserva todos los commits y el cherry-pick original sin reescribirlos. PR #65 es el origen del cambio de López y sigue referenciada como fuente histórica. No se hizo merge ni se cerró Backend #41.

## Implementación presente y disponibilidad

La auditoría anterior erró al afirmar que faltaba el controlador de listado. En Backend `master` `5abfffc9…` existen:

- `apps/taxonomy-svc/src/taxonomy-masters.controller.ts`: `GET /api/v1/tipos-producto`, `listarTiposProducto`, paginación y filtro de estado.
- `apps/taxonomy-svc/src/domain/product-type.service.ts`: consulta count + filas paginadas en una transacción de lectura PostgreSQL; mapea `tipoProductoId`, `nombre`, `estado` y `schemaVersion`.
- `apps/taxonomy-svc/src/taxonomy-auth.ts`: la ruta declara lectura por usuario y `AllowTaxonomyServiceRead` para principals de servicio; el flujo de servicio valida subject `modulo-productos` y scope `catalogo:leer`.
- `apps/api-gateway/src/routing/contract-routes.ts`: contiene la ruta GET hacia `taxonomy-svc`, con seguridad de Gateway `userBearer` solamente.
- Pruebas presentes: `taxonomy-masters.controller.spec.ts` y `test/persistencia-drizzle.e2e-spec.ts`; esquema/migraciones permiten el estado `PENDING_DEACTIVATION`.

El CI de Backend en ese SHA terminó PASS: run [41770302057](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/actions/runs/41770302057), incluyendo los jobs `Probar E2E aislado Taxonomy y Catalog` y `Probar integración de Taxonomy con PostgreSQL desechable`. Esto acredita código y pruebas del provider en CI con PostgreSQL descartable. No acredita que el Gateway desplegado enrute esta operación, que un JWT real de G7 tenga grant, ni que el frontend haya recorrido el entorno.

| Capa | Estado comprobado | Límite |
| --- | --- | --- |
| Controlador y servicio Backend | `PRESENTE` en Backend master `5abfffc9…` | Revisión estática de archivos; el SHA no debe confundirse con disponibilidad de runtime. |
| Pruebas Backend aisladas | `PRESENTES`; CI de Backend PASS en SHA `5abfffc9…` | El e2e de provider y PostgreSQL no prueba la cadena frontend → Gateway desplegado. |
| Catálogo/routing Gateway | `PRESENTE`, ruta registrada en Backend master | No se verificó gateway activo ni proxy HTTP real contra Taxonomy en un entorno desplegado. La ruta del catálogo no prueba operación. |
| PostgreSQL desechable | `PASS EN CI BACKEND` según el job específico del run citado | No ejecutado localmente durante esta revisión. La auditoría no accedió a Supabase remoto. |
| JWT real emitido por G7 | `PENDIENTE` | Los tests backend firman tokens de prueba/JWKS simulado; no equivalen a credencial o grant real G7. |
| E2E desplegado desde Frontend | `PENDIENTE` | No se hizo despliegue ni llamada de navegador al Gateway compartido. |

## Contrato HTTP y estado del tipo

Docs `master` `80f208978c2c703e2b2d62064112365e7b9e1677`, `contratos/http/openapi.yaml`, define `listarTiposProducto` como `GET /api/v1/tipos-producto`, con `userBearer` y `serviceBearer`, `x-required-scope: catalogo:leer`, `x-service-audience: api-productos`, `x-allowed-client-ids: [modulo-productos]` y `x-scope-registration-status: pending-security-registration`. El DTO `TipoProductoAdmin.estado` refiere a `EstadoEntidad`, cuyo enum admite únicamente `ACTIVO` e `INACTIVO`.

Backend `5abfffc9…` sí acepta y persiste `PENDING_DEACTIVATION`: `ProductTypeService` lo mapea en el GET; `deactivation-intent.service.ts` transiciona el tipo `ACTIVO → PENDING_DEACTIVATION` al aceptar la baja y posteriormente a `INACTIVO` o de vuelta a `ACTIVO`; la enum PostgreSQL y pruebas del servicio incluyen ese valor. No son solo estados de seguimiento de una operación: existe como estado de la entidad.

El adapter frontend aún rechaza `PENDING_DEACTIVATION` conforme al OpenAPI vigente. Si una fila listada llega en ese estado, el adapter rechaza la respuesta completa; la lista puede quedar inutilizable durante una baja activa. Esta es una incompatibilidad contrato/implementación confirmada, no una regla que el frontend deba resolver unilateralmente.

**Propuesta mínima para homologación de López y Docs:** crear `EstadoTipoProductoAdmin` específico con `ACTIVO`, `INACTIVO` y `PENDING_DEACTIVATION`, usarlo solo en `TipoProductoAdmin.estado` y documentar que el valor significa baja asíncrona en curso. Añadir ejemplo/respuesta del GET y prueba que compruebe estado pendiente y resultado final. Mantener `EstadoEntidad` sin cambio para evitar ampliar el enum compartido de otras entidades. Hasta aprobación/publicación de esa modificación, el adapter conserva validación estricta y la operación se clasifica `BLOQUEADO_CONTRATO_ESTADO` para datos que contengan el estado pendiente.

## Autorización M2M

Hay una segunda discrepancia en la misma operación:

| Fuente | Operación / archivo / SHA | Seguridad observada |
| --- | --- | --- |
| Docs OpenAPI | `GET /api/v1/tipos-producto`, `contratos/http/openapi.yaml`, `80f208978…` | `userBearer` **y** `serviceBearer`; scope `catalogo:leer`, audience `api-productos`, allowlist `modulo-productos`; registro del scope marcado pendiente. |
| Backend Gateway | `apps/api-gateway/src/routing/contract-routes.ts`, `5abfffc9…` | Solo `userBearer` en la ruta catalogada; el proxy no ofrece la alternativa M2M que declara el OpenAPI. |
| Taxonomy provider | `taxonomy-masters.controller.ts` y `taxonomy-auth.ts`, `5abfffc9…` | Controlador habilita lectura de servicio; guard exige principal service, audience configurada, subject `modulo-productos` y `catalogo:leer`. Tests comprueban denegaciones y aceptación con tokens de prueba. |

**Propuesta mínima a Seguridad/Marco/Gateway y Docs:** homologar si el acceso aprobado por Gateway debe ser usuario solamente o incluir serviceBearer. Si se conserva M2M, registrar formalmente scope/cliente/audience en Seguridad, alinear el catálogo Gateway con el allowlist exacto y probar 401/403/200 con tokens válidos y negativos; si no se autoriza, corregir el contrato para retirar `serviceBearer`. No ampliar allowlists, no habilitar ruta anónima y no cambiar guards en este PR. El frontend usa la sesión de usuario existente de G7 y no fabrica ni transporta token de servicio.

## Transporte Frontend y protección de modos

- La única operación HTTP conectada aquí es `listarTiposProducto`. El tamaño de página es 100 (máximo contractual anterior), se valida `items/meta`, continuidad y consistencia de páginas, y se envía un `X-Correlation-Id` estable durante la paginación.
- El transporte reutiliza la sesión de usuario G7 existente de Promociones. `secureBase` se carga de forma diferida únicamente cuando hay modo API, Gateway y runtime de sesión; mantiene HTTPS fuera de loopback, y no carga módulos de Promociones en la ruta API bloqueada sin configuración.
- Usa `credentials: omit`, `redirect: error`, `cache: no-store`, timeout de 15 s y cancelación. Los fallos de red se sanitizan; la falta de sesión usa un error tipado con mensaje seguro. API no vuelve a fixtures.
- El selector global es `VITE_DATA_MODE`; las demás operaciones de Taxonomía siguen sin adapter API. La frontera HTTP local aún no usa el cliente compartido #45 / Backend #109; su composición sigue pendiente y no se duplica la sesión.

## Pruebas Frontend y fallo E2E auditado

En el SHA `05c4b57`, el run Frontend [41782659898](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41782659898) tuvo: `quick PASS`, `modes PASS`, `smoke PASS`, `e2e (1) PASS`, `e2e (2) PASS`, `e2e (3) FAIL`, `validate FAIL`. Shard 3 reportó **182 passed, 6 skipped y 1 failed**. La única prueba fallida fue `tests/promotions-visual.spec.ts:106`: en modo API sin configuración encontró una URL de recurso `features/promotions/` o `/mocks/`.

La causa se reprodujo localmente con Node `22.23.4`: el import estático de `secureBase` en `src/main.tsx` descargaba el módulo de Promociones aun cuando no existían Gateway/sesión. La solución quita ese import estático y carga `secureBase` dentro de la rama configurada. La misma prueba Playwright focalizada pasa con la importación diferida; el test no se modificó.

El texto `Fallo en la notificación onUpdated…` de `tests/vera-integration.spec.ts:133` es la excepción intencional que la prueba captura para verificar la tolerancia al callback; no es una segunda prueba fallida ni se debe contabilizar como tal.

`npm test` no incluía el config `src/features/taxonomy/adapters/vitest.config.ts`. Se añadió el script `test:unit:taxonomy` y se encadenó a `npm test`, que ya es el comando del job `quick`; no se modificó `.github/workflows/frontend.yml` ni la atomización #63. El script ejecuta adapter y UI (`httpProductTypeAdapter.test.ts`, `taxonomyApiUi.test.tsx`).

## Ejecución local e integración pendiente

La revisión instaló dependencias con `npm ci` y Node `22.23.4`, dentro de `>=22.12.0 <23`; no se amplió el rango ni se editó lockfile. Resultados locales de la corrección:

| Comando / validación | Resultado | Detalle |
| --- | --- | --- |
| `npm run test:unit:taxonomy` | `PASS` | 2 archivos, 25 tests (adapter y UI). |
| `npm test` | `PASS` | 6 configs: 405 tests totales; incluye 25 tests Taxonomy. |
| `npm run lint` | `PASS` | Node `22.23.4`. |
| `npm run typecheck` | `PASS` | Node `22.23.4`. |
| `VITE_DATA_MODE=mock npm run build` | `PASS` | Build de producción completado. |
| `VITE_DATA_MODE=api npm run build` | `PASS` | Build de producción completado. |
| Playwright focalizado `tests/promotions-visual.spec.ts`, prueba global API | `PASS` | 1 prueba; reprodujo el fallo en `05c4b57`, pasa con el import dinámico. El test no se modificó. |
| `npm ci` | `PASS` | Instaló lockfile con Node `22.23.4`. npm reportó 13 advisories (12 moderados, 1 alto); dependencias no cambiadas ni remediadas dentro de este alcance. |

El job `quick` ya ejecuta `npm test`, de modo que Taxonomy entra en CI por el script agregado. No se modificó workflow `.github` ni el trabajo de atomización #63. Para el SHA funcional `9a2bedcfbe6f15543e31d8bdc44931f9449d6f9b`, Frontend CI [41787727392](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-frontend/actions/runs/41787727392) terminó con los siete jobs PASS: `quick`, `smoke`, `e2e (1)`, `e2e (2)`, `e2e (3)`, `modes` y `validate`. La edición documental posterior tendrá su propio run en el HEAD actualizado de la PR.

La secuencia de integración frontend real requiere Gateway, `taxonomy-svc`, PostgreSQL desechable y credencial de usuario válida. Docker está instalado pero no había contenedores locales activos; no se levantó el stack ni se dispuso de una sesión Gateway/G7. No se ha usado Supabase remoto. La prueba reproducible deberá cubrir GET/paginación, lista vacía, estado persistido, correlación, 401 sin JWT, 403 de usuario no autorizado, upstream fallido y ausencia de fallback mock. El JWT real G7 sigue `PENDIENTE` hasta disponer de credencial/grant legítimo; ningún token de test se presentará como tal.

## Pendientes concretos y owners

1. **López / Docs:** homologar el estado real `PENDING_DEACTIVATION` en `TipoProductoAdmin.estado`, publicar el contrato y su ejemplo/prueba. Desbloqueo verificable: OpenAPI de Docs con enum específico actualizado y prueba de listado aceptando el estado.
2. **Seguridad / Marco / Gateway:** resolver `serviceBearer` vs `userBearer` y la allowlist M2M para `listarTiposProducto`. Desbloqueo: contrato y catálogo Gateway alineados, registro de scope en G7 y prueba de autorización con tokens de prueba; el JWT real G7 se valida aparte.
3. **Frontend / Backend #45/#109:** incorporar Taxonomy al cliente compartido sin duplicar sesión ni DTO. Desbloqueo: interfaz compartida aprobada y tests del consumidor.
4. **Integración operativa:** demostrar el recorrido contra Gateway y PostgreSQL desechable, y por separado JWT G7 y E2E desplegado. Backend CI con tests de servicio no sustituye esta evidencia.

La PR sucesora permanece en borrador aunque la CI del SHA funcional esté en PASS: faltan homologación contractual, autorización M2M alineada y evidencia de integración desplegada. El run del HEAD documental actualizado se verifica por separado en PR #67. No se cierra Backend #41 ni se declara lista para despliegue.
