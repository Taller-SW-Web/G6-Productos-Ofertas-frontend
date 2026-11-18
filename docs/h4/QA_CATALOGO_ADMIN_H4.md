# QA de Catálogo administrativo H4

En un ambiente autorizado usar `VITE_DATA_MODE=api`, `VITE_GATEWAY_ORIGIN`, `VITE_G7_API_BASE` y `VITE_G6_ADMIN_API_ENABLED=true`. Confirmar que el Gateway de ese ambiente expone la lectura administrativa y que G7 emite una sesión humana con `GESTOR_COMERCIAL`. La lectura comercial para otros consumidores sigue disponible por su adaptador explícito. Mantener las credenciales de servicio fuera de Vite.

| Pantalla | Operaciones de Gateway | Qué revisar |
| --- | --- | --- |
| Listado de productos | `GET /productos/administracion` | Categoría, tipo, estado, búsqueda y paginación se envían al servidor. Tipo usa `tipoProductoIdsIncluidos`. Los nombres provienen de Taxonomía. Si un maestro falla, el listado permanece disponible. |
| Detalle de producto | `GET /productos/administracion/{productoId}` y `GET /productos/{productoId}/preparacion` | El UUID y la versión pertenecen al producto solicitado. Nombres de categoría, marca y tipo se resuelven mediante colecciones autenticadas. |
| Alta de producto | `POST /productos` | Confirmar borrador, SKU base y versión. Verificar el estado de preparación por separado. Ante una escritura incierta, reconciliar el SKU. |
| Edición de producto | `PATCH /productos/{productoId}` | Enviar `catalogVersion`. Q-06 exige `elegibleCorreccionTipo=true` y esquema vigente. Enviar `tipoProductoId` solo al cambiarlo. Un 409 conserva el formulario. |
| Preparación de producto | `GET /productos/{productoId}/preparacion`, `POST …/preparacion/reintentar` | Distinguir PENDING, COMPLETED y REJECTED. Reintentar solo si Catalog lo autoriza. |
| Variantes | `GET/POST /productos/{productoId}/variantes`, `GET/PATCH …/{variantId}` | SKU explícito al crear. Conservar la identidad de la variante al editar. Revisar atributos, imagen, perfil físico y conflicto de versión. |
| Preparación de variante | `GET /productos/{productoId}/preparacion`, `POST …/variantes/{variantId}/preparacion/reintentar` | Usar el estado devuelto para ese SKU. |
| Cambios de estado | `POST …/activar`, `POST …/desactivar`, `POST …/reactivar` | Verificar la elegibilidad devuelta por Catalog, preservar códigos de error y actualizar la lectura. |

El prefijo de Gateway es `/api/v1`. Ante 401, 403 o 503 registrar el código, la operación y el ID de correlación. Las pruebas `tests/catalog-http-ui.spec.ts` usan Chromium y rutas HTTP interceptadas, con fixtures de éxito y error. La guía permanece pendiente de ejecución bilateral con G7 y Gateway reales.
