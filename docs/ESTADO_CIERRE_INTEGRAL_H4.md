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
| 001 Bulk | Adaptador HTTP multipart v2 con sesión G7, consulta, reanudación, descargas y controles de resultado incierto ya presentes. El login ahora se expone desde la composición de toda la aplicación. | Operaciones `provisional-internal`; disponibilidad de Gateway/provider y grant humano no verificados. El adapter conserva su propio transporte de feature. | `PARTIAL` — no se ejecutó E2E autenticado. |
| 002 Combos | Pantallas y validación existentes. | No hay repositorio HTTP; rutas administrativas `provisional-internal`, scopes `combos:leer` pendientes de registro. API muestra indisponibilidad. | `BLOCKED_BACKEND` / `BLOCKED_SECURITY`. |
| 003 Catálogo | Se conectó el transporte de Catalog al cliente autenticado y a la sesión G7 compartida. | Las lecturas administrativas de lista/detalle siguen bloqueadas por los DTO comerciales publicados; hay operaciones de escritura con estado interno/provisional. | `PARTIAL` — no se afirma integración completa. |
| 004 Variantes/SKU | Comparte el adapter HTTP autenticado de Catalog y sus mappers existentes. | Lecturas/preparación de SKU dependen de campos administrativos y relaciones que el contrato vigente no ofrece en esas respuestas; no se rellenan con mocks. | `PARTIAL`. |
| 005 Cupones | Adapter administrativo Promotions y formularios existentes usan la sesión G7 que ahora se solicita globalmente. | Grants G7, autorización efectiva y E2E externo pendientes. | `FRONTEND_READY_PENDING_E2E` para el adapter; no `API_INTEGRATED`. |
| 006 Promociones | Adapter HTTP CRUD/estados existente, con errores tipados. | Grants/permisos, upstream y despliegue no comprobados en este entorno. | `FRONTEND_READY_PENDING_E2E`. |
| 007 Recomendaciones | Adapter existente y referencias a Catálogo, sin cálculo local de precio final ni reserva de stock. | La consulta de referencias y autorización reales requieren servicios/G7 disponibles. | `PARTIAL`. |
| 008 Categorías | UI y mocks existentes. | No hay adapter HTTP administrativo compuesto para el flujo completo. | `BLOCKED_BACKEND` para API. |
| 009 Características/valores | UI y mocks existentes. | No hay adapter HTTP administrativo compuesto para el flujo completo. | `BLOCKED_BACKEND` para API. |
| 010 Tipos y asociaciones | Listado y esquema de tipo de producto tienen adapters HTTP y transporte autenticado compartido. | Otras operaciones/seguimientos siguen sin adapter; estado contractual/security de operaciones de escritura y homologación se conserva como pendiente. | `PARTIAL`. |
| 011 Marcas | UI mock existente. | Falta adapter multipart/logo HTTP autenticado y pruebas del provider. | `BLOCKED_BACKEND` para API. |
| 012 SEO | UI mock existente. | Falta adapter HTTP administrativo compuesto. | `BLOCKED_BACKEND` para API. |
| 013 Pricing | El composition root inyecta el repositorio HTTP existente y exige localmente `GESTOR_COMERCIAL` para actualizar/programar. | No hay fuente autorizada para `listCatalogTargets` ni ID canónico de canal Retail. Las mutaciones con introspección obligatoria reciben 503 en Gateway; no hay bypass. `prevalidarImportacionPrecios` y `crearImportacionPrecios` son `excluded-h4`. | `PARTIAL`; lecturas/selección y escrituras quedan sujetas a dependencias. |
| 014 Price Audit | Modelo, pantallas, exportación y adapter mock existentes. | Falta repositorio HTTP productivo; operaciones de exportación son `provisional-internal`. | `BLOCKED_BACKEND` para API. |
| 015 Inventario | Se compone `configureInventoryApi()` con el adapter HTTP existente y sesión G7. El gate dejó de bloquear toda la sección. | Alertas, nombres/ubicaciones y otros campos de UI que el contrato no publica permanecen bloqueados; los métodos sin fuente autoritativa fallan explícitamente. | `PARTIAL`. |
| 016 Dashboard/alertas | Dashboard y adapter HTTP existente quedan alcanzables por la composición API. | El contrato no publica alertas independientes ni todos los campos agregados de pantalla; `null` no se convierte en cero. | `PARTIAL`. |

## Autenticación y composición añadidas

- Se incorporó `createAuthenticatedGatewayClient`: restringe destinos a un origen Gateway HTTPS (HTTP solo loopback), exige token humano G7, descarta cookies/redirects, aplica timeout y correlación, soporta respuestas opacas (binario/multipart) y reintenta como máximo una lectura GET con `TOKEN_INVALIDO` después de refresh. Nunca reenvía automáticamente una mutación.
- El cliente permite inyectar `fetch` para pruebas contractuales y conserva `AbortSignal`, encabezados de idempotencia y `Content-Type` aportados por cada adapter.
- El login/MFA/logout G7 existente se ofrece desde el shell global en modo API; no se persisten tokens. La composición no habilita API cuando falta Gateway o la URL G7.
- Catálogo, Pricing, Taxonomy e Inventario usan el cliente común. Bulk y Promotions conservan sus transportes especializados existentes y comparten la misma instancia de `G7Session`.
- `/` ahora abre Catálogo (`/productos`) en vez de Pricing, cuyo runtime API requería datos que no están resueltos.
- Pricing aplica una comprobación local del rol `GESTOR_COMERCIAL` para actualizar/programar; Gateway sigue siendo la autoridad final.

## Matriz OpenAPI y límites de la evidencia

La matriz completa de 136 filas está en [`MATRIZ_OPENAPI_H4.csv`](MATRIZ_OPENAPI_H4.csv). Se regenera con:

```powershell
python -m pip install PyYAML==6.0.3
python scripts/generate-h4-openapi-matrix.py
```

El script usa Docs y Backend `origin/master` locales (deben tener `fetch` actualizado), registra ambos SHA por fila y escanea los operationIds en Gateway, servicios, adapters y pruebas. Un `NO_STATIC_MATCH` significa que el texto literal no se encontró; no demuestra por sí solo que no exista una ruta construida dinámicamente. Se requiere revisión semántica antes de aceptar cualquier fila como integración.

Clasificación del escaneo actual: `BLOCKED_BACKEND` 91, `BLOCKED_SECURITY` 17, `EXCLUDED_H4` 2, `NOT_APPLICABLE_UI` 26. El escaneo textual no acredita ninguna operación `API_INTEGRATED`; las operaciones con adapter quedan como candidatas a `FRONTEND_READY_PENDING_E2E` únicamente tras confirmar manualmente la ruta, DTO, runtime y prueba correspondiente.

## Dependencias externas pendientes

| Owner | Operación o frontera | Condición concreta de desbloqueo |
|---|---|---|
| G7 Seguridad / Marco | Login G7, MFA, JWT humano, refresh, roles/scopes y sesiones reales para los ocho servicios | Issuer/JWKS, audience, grant/roles reales provisionados y una sesión humana de prueba válida; luego evidencia positiva y negativa HTTP vinculada a SHA. |
| Backend / API Gateway | Operaciones `provisional-internal` de Combos, Taxonomy y exports de Price Audit; contratos/DTO faltantes de Catálogo e Inventario | Controller/provider y ruta gateway vigentes que cumplan el OpenAPI publicado, confirmados por tests HTTP y respuesta real contractualmente válida. Frontend no crea rutas. |
| Backend Pricing / Gateway | `actualizarPrecioSku` y operaciones con `introspection` requerida | Implementar introspección autorizada del Gateway o publicar una decisión/contrato revisado y verificable; no aceptar 503 como éxito. |
| Catálogo / Pricing / Marco | Selección de objetivos de Pricing y canal Retail | Endpoint/DTO oficial de objetivos activos con identidad SKU/producto y un `channelId` canónico publicado. No deducirlo de etiquetas ni fabricar UUID. |
| Backend / infraestructura Gateway | CORS | Entregar URL Gateway y entorno con origen permitido; demostrar preflight `OPTIONS` y solicitudes autenticadas del origen Vercel esperado. La configuración fuente consultada no contiene CORS explícito y no se encontró un `Caddyfile` en el repo Backend; no se pudo comprobar runtime sin endpoint configurado. |
| Backend / owners de módulos | Datos de presentación faltantes en Inventario | Publicar fuente contractual para alertas, ubicaciones/nombres y campos requeridos o ajustar la presentación aprobada a los campos disponibles. |

No se modificaron Backend, Docs, G7, Vercel, secretos ni bases de datos. No se desplegó ni publicó un PR.
