# Inventario de integración Taxonomía — #41

Referencia: OpenAPI 0.6.0-rc.2, Gateway y taxonomy-svc de Backend `606e36ce668b46b01a8681ea6028d93e0b02f7e5`. La presencia de una ruta en el catálogo Gateway no acredita despliegue ni grants.

| Pantalla / interacción | Operaciones contractuales y estado |
| --- | --- |
| MK-008 categorías: lecturas comerciales | HTTP disponible: `listarCategorias` GET `/categorias`; devuelve solo activas y requiere identidad de servicio. No cubre el árbol administrativo. |
| MK-008 categorías: crear, editar, reactivar | HTTP disponible en el servicio: `crearCategoria`, `actualizarCategoria`, `reactivarCategoria`; requieren usuario y verificación de sesión/Gateway. |
| MK-008 árbol, detalle y baja | Mock transitorio explícito en modo mock. Bloqueado en API: no se confirmó implementación de las lecturas administrativas o del flujo de baja para esta pantalla. |
| MK-009 características y reactivaciones | Mock transitorio explícito en modo mock. Bloqueado en API: falta gestión HTTP completa de características y reactivación; valores específicos sí tienen lectura, creación, edición y baja en el servicio. |
| MK-010 tipos: listado | Adaptador frontend para `listarTiposProducto` GET `/api/v1/tipos-producto`; contrato OpenAPI 0.6.0-rc.2 marcado `provisional-internal`. Implementación en taxonomy-svc y flujo por Gateway no verificados; Backend #37 sigue pendiente. DTO no incluye conteos ni límite de características; `TipoProductoAdmin.estado` solo permite `ACTIVO/INACTIVO`, mientras `PENDING_DEACTIVATION` está definido para seguimiento de operación, no para este listado. |
| MK-010 esquema, creación, asociación y baja | Sin adaptador en esta entrega; cada operación de API queda bloqueada hasta verificar implementación y conectar su recorrido contractual. Reactivación permanece en mock. |
| MK-011 marcas: lecturas comerciales | HTTP disponible: `listarMarcas` GET `/marcas`; devuelve solo activas y requiere identidad de servicio. No cubre la lista administrativa completa. |
| MK-011 marcas: crear, editar y reactivar | HTTP disponible en el servicio; multipart y JWT humano requieren adaptación contractual y prueba. El detalle y la baja administrativa permanecen bloqueados en API. |
| MK-012 SEO | Mock transitorio explícito en modo mock; bloqueado en API mientras el servicio no implemente las operaciones necesarias. |

El único selector es `VITE_DATA_MODE`. En API no se recurre a fixtures ante errores; las operaciones no conectadas fallan cerradas. La integración de sesión usa la sesión G7 ya existente; el transporte inyectable de Taxonomía es provisional hasta disponer del cliente compartido (#109). No se exponen credenciales de servicio al navegador. Los grants de Seguridad, homologación externa y recorrido Gateway real no quedan acreditados por este inventario.

## Interacciones y frontera de ejecución

- **MK-008, HTTP disponible en el servicio:** `listarCategorias`, `crearCategoria`, `actualizarCategoria`, `reactivarCategoria`. **Bloqueadas en API:** `obtenerArbolCategoriasAdmin`, `obtenerCategoriaAdmin`, `listarCategoriasAdmin`, `solicitarDesactivacionCategoria` y seguimiento administrativo; las pantallas conservan el mock solo en modo mock.
- **MK-009, HTTP disponible en el servicio:** `listarValoresCaracteristica`, `crearValorCaracteristica`, `actualizarValorCaracteristica`, `solicitarDesactivacionValorCaracteristica`. **Bloqueadas en API:** listado, creación, consulta, edición y cambio de estado de características, y reactivación de valor.
- **MK-010:** solo `listarTiposProducto` tiene adaptador frontend en este avance. El contrato de listado está marcado `provisional-internal`; la implementación del provider y la ruta operativa de Gateway requieren verificación (Backend #37/#21). Las demás operaciones y pantallas permanecen bloqueadas en API.
- **MK-011, HTTP disponible en el servicio:** `listarMarcas`, `crearMarca`, `actualizarMarca`, `reactivarMarca`. **Bloqueadas en API:** `listarMarcasAdmin`, `obtenerMarcaAdmin` y `solicitarDesactivacionMarca`.
- **MK-012, bloqueada en API:** `obtenerSeoCategoriaAdmin`, `actualizarSeoCategoria`, `listarHistorialSlugCategoria`; se conserva mock explícito en modo mock.

La presencia de una ruta contractual no acredita un controlador del provider, su disponibilidad en Gateway ni una prueba de extremo a extremo. El listado usa un transporte provisional inyectable y la sesión G7 existente de Promociones: si no hay token válido, informa que debe iniciarse sesión allí y reintentarse. La sustitución por el cliente transversal sigue pendiente de Frontend #45 / Backend #109.

Pruebas focalizadas: `npx vitest run --config src/features/taxonomy/adapters/vitest.config.ts`. Las respuestas de esas pruebas son simuladas y no acreditan Gateway real.
