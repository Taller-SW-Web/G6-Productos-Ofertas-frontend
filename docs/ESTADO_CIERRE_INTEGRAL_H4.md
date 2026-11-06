# Cierre integral H4 — estado para auditoría estática

**Frontend branch:** `fix/frontend-h4-cierre-integral`
**Base:** Frontend `origin/master` `4d1b85969816f2879a6f6f17b3553cccba0ab764`
**Docs consultado:** `origin/master` `a7778ec1a22811c1213a94ef096ab905911342cc`
**Backend consultado:** `origin/master` `61171913510daddc5baedc9532b236de1953fac5`
**Fecha:** 2026-11-06

Este informe distingue código frontend, fuentes contractuales, disponibilidad externa y validaciones. La tabla de OpenAPI es un inventario estático generado; la coincidencia textual de una ruta/operación no demuestra que un servicio esté desplegado ni que G7 haya concedido un grant.

## Estado de las 16 MK

| MK | Implementación comprobable en Frontend | Frontera API y bloqueo | Estado de esta intervención |
|---|---|---|---|
| 001 Bulk | Adapter multipart v2 con sesión G7, consulta, reanudación, descargas y control de resultados inciertos. | Upstream, permisos efectivos y E2E autenticado no comprobados. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`; E2E `NO EJECUTADO`. |
| 002 Combos | Runtime API compone lectura, alta, edición, baja y disponibilidad; selección/resolución utiliza Catálogo y consulta precios con Pricing. Confirmación HTTP, DTO y enriquecimientos posteriores se separan; incertidumbre por intención persiste a recarga. | Sin idempotencia/consulta de correlación en el contrato, un alta cuyo resultado no se puede reconciliar queda bloqueada por esa intención. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 003 Catálogo | `GET /productos` mapea `ProductoResumenComercial` sin variante/versión/estado administrativo/preparación asumidos. Filtros enviados se limitan a los parámetros publicados. Detalle comercial + preparación y variantes reales permiten lectura. | Sin versión administrativa en este flujo; las pantallas API no envían edición ni cambios de estado del producto. | `LECTURA_COMERCIAL_IMPLEMENTADA; ESCRITURA_ADMINISTRATIVA_RESTRINGIDA_POR_DTO`. |
| 004 Variantes/SKU | Adaptador obtiene variantes paginadas y verifica identidad/estado; SKU activos alimentan selección de Pricing, Combos e Inventario. | Operaciones que requieren datos/versiones no devueltos permanecen deshabilitadas; no se fabrican SKU. | `LECTURA_Y_SELECCIÓN_IMPLEMENTADAS; PRUEBAS NO EJECUTADAS`. |
| 005 Cupones | Adapter administrativo Promotions y formularios existentes usan la sesión G7 que ahora se solicita globalmente. | Grants G7, autorización efectiva y E2E externo pendientes. | `FRONTEND_READY_PENDING_E2E` para el adapter; no `API_INTEGRATED`. |
| 006 Promociones | Adapter HTTP CRUD/estados existente, con errores tipados. | Grants/permisos, upstream y despliegue no comprobados en este entorno. | `FRONTEND_READY_PENDING_E2E`. |
| 007 Recomendaciones | Adapter existente y referencias a Catálogo, sin cálculo local de precio final ni reserva de stock. | La consulta de referencias y autorización reales requieren servicios/G7 disponibles. | `PARTIAL`. |
| 008 Categorías | Árbol, detalle/versionado, alta con resolución/confirmación slug, edición, baja segura, reactivación y seguimiento por operación tienen adapter HTTP autenticado. | Sin garantía de grant/upstream real. No se presupone nivel/orden/slug ausentes. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 009 Características/valores | Listado paginado, detalle, alta/edición, valores, cambios de estado, bajas y seguimiento tienen adapters HTTP. La resolución del padre de un valor tras recarga usa registro y valores autoritativos. | Configuración de límites no publicada; no se presenta como configuración del provider. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 010 Tipos y asociaciones | Listado paginado, alta/detalle/esquema, asociaciones, obligatoriedad, desasociaciones, baja/reactivación y seguimiento tienen adapter HTTP. | Los campos agregados no publicados quedan `null`; grants y provider no verificados. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 011 Marcas | Listado administrativo paginado, detalle, multipart de alta/edición (sin boundary manual), baja y reactivación. | No hay confirmación de provider/grant de entorno; los nombres/logo no se simulan. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 012 SEO | Listado/consulta, resolver slug, actualización, conflicto y registro histórico tienen adapter HTTP. | Los recursos sin SEO se omiten según 404 contractual; no se afirma integración autenticada externa. | `FRONTEND_IMPLEMENTED_STATIC_REVIEW_PENDING`. |
| 013 Pricing | Runtime inyecta selección paginada desde Catálogo para productos y variantes activas con identidades producto/SKU validadas. Las consultas globales no requieren ID Retail. | Sigue el 503 de introspección del Gateway; mutaciones Retail sin canal canónico se restringen. Importaciones siguen `excluded-h4`. | `ADAPTER_COMPOSITION_IMPLEMENTED_STATIC_REVIEW_PENDING` |
| 014 Price Audit | P0-A: `COMPLETED` habilita `/archivo` aunque `download_url` sea null. P0-B: red/timeout/5xx/respuesta inválida del POST se clasifica incierta, queda latched en `sessionStorage` y la UI bloquea reenvío, indicando reconciliación manual por historial. | Endpoint puede responder 503; OpenAPI no publica clave idempotente ni búsqueda por correlación. | `P0_CORRECTED_STATIC_REVIEW_PENDING` |
| 015 Inventario | Saldos consultan el universo paginado de SKU comercialmente activos, en lotes de hasta 100, con filtros/datos maestros y cancelación; traslados reutilizan un índice de presentación temporal y conservan IDs de ubicación. Recepciones idempotentes no se alteran. | Cobertura es el catálogo comercial activo, no todo el inventario; sin fuente de ubicaciones se muestra ID. Campos ausentes de stock siguen `null`. | `LECTURA_DISPONIBLE_POR_COBERTURA_COMERCIAL; ALCANCE PARCIAL CONTRACTUAL`. |
| 016 Dashboard/alertas | KPIs/distribución proceden del dashboard contractual; la pantalla comunica el alcance disponible. | No hay endpoint contractual de alertas. La consulta de alertas falla explícitamente; no se calcula ni se simula. | `DASHBOARD_IMPLEMENTADO; ALERTAS BLOQUEADAS POR AUSENCIA DE OPERACIÓN`. |

## Autenticación y composición añadidas

- Se incorporó `createAuthenticatedGatewayClient`: restringe destinos a un origen Gateway HTTPS (HTTP solo loopback), exige token humano G7, descarta cookies/redirects, aplica timeout y correlación, soporta respuestas opacas (binario/multipart) y reintenta como máximo una lectura GET con `TOKEN_INVALIDO` después de refresh. Nunca reenvía automáticamente una mutación.
- El cliente permite inyectar `fetch` para pruebas contractuales y conserva `AbortSignal`, encabezados de idempotencia y `Content-Type` aportados por cada adapter.
- El login/MFA/logout G7 existente se ofrece desde el shell global en modo API; no se persisten tokens. La composición no habilita API cuando falta Gateway o la URL G7.
- Catálogo, Pricing, Taxonomy e Inventario usan el cliente común. Bulk y Promotions conservan sus transportes especializados existentes y comparten la misma instancia de `G7Session`.
- `/` ahora abre Catálogo (`/productos`) en vez de Pricing, cuyo runtime API requería datos que no están resueltos.
- Pricing aplica una comprobación local del rol `GESTOR_COMERCIAL` para actualizar/programar; Gateway sigue siendo la autoridad final.

## Recorridos revisados estáticamente en esta entrega

Estos recorridos se siguieron en composición, adapters, DTOs y UI. Ninguno se ejecutó contra servicios reales; sus pruebas siguen `NO EJECUTADAS`.

| Recorrido | Evidencia estática y límite que conserva |
|---|---|
| Login G7 → Catálogo → producto → variantes | `GlobalSessionGate` exige sesión humana; el cliente limita origen y path al Gateway `/api/v1/`. `GET /productos` usa un mapper comercial sin asumir versión/estado/preparación; detalle, preparación y variantes usan sus operaciones reales. Edición de producto queda cerrada cuando no hay versión administrativa. |
| Catálogo → objetivos de Pricing → precio | `main.tsx` enumera páginas completas, productos comercialmente activos y variantes `ACTIVA`, verifica identidades y compone `listCatalogTargets`; Pricing vuelve a validar los objetivos antes de leer. La lectura global no requiere canal Retail. Mutaciones que necesitan su ID canónico siguen restringidas y el 503 del Gateway no se evita. |
| Catálogo → editor de Combos → precio → escritura | El adapter resuelve SKU mediante Catálogo y lectura de precio; el repositorio HTTP confirma por separado alta/edición/baja, DTO y presentación/disponibilidad. No reintenta mutaciones. Alta incierta o 201 sin DTO se bloquea por fingerprint; el contrato no ofrece idempotencia ni lookup de correlación para reconciliar automáticamente una respuesta perdida. |
| Taxonomy → alta/edición → baja/reactivación → seguimiento | Categorías, características/valores, tipos/asociaciones, marcas multipart y SEO comparten el transporte humano. Se validan códigos esperados, metadatos completos de páginas, versiones y operación `GET /taxonomia/operaciones/{operationId}`. Los límites no publicados permanecen desconocidos. |
| Catálogo → SKU → disponibilidad → stock/traslados | Un índice acotado de SKU activos, compartido por lecturas de Inventario y transferencias, consulta páginas completas y evita recorridos repetidos por traslado. Disponibilidad se pide en lotes de hasta 100 y por ubicaciones conocidas; el dashboard no se presenta como cobertura global. La recepción conserva idempotencia y resultado incierto previos. |
| Price Audit → solicitud → seguimiento → descarga | El estado de una exportación completada permite intentar `/archivo` con el bearer humano aunque `download_url` sea `null`. Un POST no confirmado queda bloqueado y el seguimiento/historial se usa para reconciliar; el 503 de archivo se expone honestamente. |

## Matriz OpenAPI y límites de la evidencia

La matriz completa de 136 filas está en [`MATRIZ_OPENAPI_H4.csv`](MATRIZ_OPENAPI_H4.csv). Se regenera con:

```powershell
python -m pip install PyYAML==6.0.3
python scripts/generate-h4-openapi-matrix.py
```

El script usa Docs y Backend `origin/master` locales (deben tener `fetch` actualizado), registra ambos SHA por fila y escanea los operationIds en Gateway, servicios, adapters y pruebas. Un `NO_STATIC_MATCH` significa que el texto literal no se encontró; no demuestra por sí solo que no exista una ruta construida dinámicamente. Se requiere revisión semántica antes de aceptar cualquier fila como integración.

La matriz es un inventario de evidencia por capas. Una fila `PUBLISHED` solo acredita presencia en OpenAPI; `NOT_VERIFIED` en Gateway/controller indica que el texto de operationId no acredita ejecución. Autorización web, adaptador, composición, pruebas y bloqueos externos se registran en columnas independientes y no se deducen automáticamente.

## Dependencias externas pendientes

| Owner | Operación o frontera | Condición concreta de desbloqueo |
|---|---|---|
| G7 Seguridad / Marco | Login G7, MFA, JWT humano, refresh, roles/scopes y sesiones reales para los ocho servicios | Issuer/JWKS, audience, grant/roles reales provisionados y una sesión humana de prueba válida; luego evidencia positiva y negativa HTTP vinculada a SHA. |
| Backend / API Gateway | Operaciones `provisional-internal` de Combos, Taxonomy y exports de Price Audit; contratos/DTO faltantes de Catálogo e Inventario | Controller/provider y ruta gateway vigentes que cumplan el OpenAPI publicado, confirmados por tests HTTP y respuesta real contractualmente válida. Frontend no crea rutas. |
| Backend Pricing / Gateway | `actualizarPrecioSku` y operaciones con `introspection` requerida | Implementar introspección autorizada del Gateway o publicar una decisión/contrato revisado y verificable; no aceptar 503 como éxito. |
| Catálogo / Pricing / Marco | Selección de objetivos de Pricing y canal Retail | Endpoint/DTO oficial de objetivos activos con identidad SKU/producto y un `channelId` canónico publicado. No deducirlo de etiquetas ni fabricar UUID. |
| Backend / infraestructura Gateway | CORS | Entregar URL Gateway y entorno con origen permitido; demostrar preflight `OPTIONS` y solicitudes autenticadas del origen Vercel esperado. La configuración fuente consultada no contiene CORS explícito y `ops/oracle/Caddyfile` sí existe en Backend `origin/master` `61171913510daddc5baedc9532b236de1953fac5`; no se pudo comprobar runtime sin endpoint configurado. |
| Backend / owners de módulos | Datos de presentación faltantes en Inventario | Publicar fuente contractual para alertas, ubicaciones/nombres y campos requeridos o ajustar la presentación aprobada a los campos disponibles. |

No se modificaron Backend, Docs, G7, Vercel, secretos ni bases de datos. No se desplegó ni publicó un PR. Las suites completas, integración, Playwright, E2E, builds y regresión siguen NO EJECUTADAS; typecheck rápido se ejecutó con Node 22.23.4.
